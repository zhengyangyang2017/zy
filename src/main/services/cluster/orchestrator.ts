/**
 * ClusterOrchestrator — manages the 20-agent pool, DAG execution, and cluster state.
 *
 * Lifecycle:
 * 1. init() → create agent pool, start scheduler
 * 2. submitGoal(goal) → decompose into workflow DAG → enqueue tasks
 * 3. Agents auto-steal, execute, publish results
 * 4. Monitor heartbeats, restart dead agents
 * 5. shutdown() → graceful stop
 */

import { EventBus, getEventBus, createEvent } from './event-bus'
import { WorkStealingQueue, getWorkStealingQueue } from './task-queue'
import { initClusterStateStore, checkIdempotency, recordIdempotency, upsertAgentState, getAgentStates } from './state-store'
import { getRoleHandler, hasApiKey } from './agent-roles'
import { buildWorkflowFromHints, executeWorkflow } from './workflow'
import { logger } from '../logger'
import type {
  AgentId,
  AgentInfo,
  AgentHeartbeat,
  Task,
  TaskInput,
  TaskResult,
  TaskType,
  ClusterConfig,
  ClusterState,
  ClusterEvent,
  QueueStats,
} from './types'
import type { DecompositionHint } from './workflow'
import { DEFAULT_CLUSTER_CONFIG } from './types'

export class ClusterOrchestrator {
  private config: ClusterConfig
  private bus: EventBus
  private queue: WorkStealingQueue
  private agents: Map<AgentId, AgentInfo> = new Map()
  private agentTasks: Map<AgentId, Promise<void>> = new Map()
  private abortControllers: Map<AgentId, AbortController> = new Map()
  private running = false
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private stateSyncTimer: ReturnType<typeof setInterval> | null = null
  private startedAt = 0
  private pendingTaskPromises: Map<string, { resolve: (r: TaskResult) => void; reject: (e: Error) => void }> = new Map()

  constructor(config: Partial<ClusterConfig> = {}) {
    this.config = { ...DEFAULT_CLUSTER_CONFIG, ...config }
    this.bus = getEventBus(this.config.eventBufferSize)
    this.queue = getWorkStealingQueue()
    initClusterStateStore()
  }

  // ============================================
  // Lifecycle
  // ============================================

  /** Start the cluster: create agent pool, begin scheduling. */
  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.startedAt = Date.now()

    if (!hasApiKey()) {
      logger.warn('Orchestrator', 'No API key configured. Agents will fail on LLM tasks.')
    }

    // Create agent pool
    for (let i = 0; i < this.config.agentCount; i++) {
      const agentId = `agent_${i + 1}`
      this.queue.registerAgent(agentId)
      this.agents.set(agentId, {
        id: agentId,
        status: 'idle',
        currentTask: null,
        tasksCompleted: 0,
        tasksFailed: 0,
        avgTaskMs: 0,
        lastHeartbeat: Date.now(),
        uptime: 0,
        role: 'general',
        roleHistory: [],
      })
    }

    // Start agent loops (async, non-blocking)
    for (const agentId of this.agents.keys()) {
      this.startAgentLoop(agentId)
    }

    // Start heartbeat monitoring
    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), this.config.heartbeatIntervalMs)

    // Start state sync
    this.stateSyncTimer = setInterval(() => this.syncState(), this.config.stateSyncIntervalMs)

    // Monitor subscription: restart dead agents
    this.bus.subscribe('agent:heartbeat', (event) => {
      const heartbeat = event.payload as AgentHeartbeat
      const agent = this.agents.get(heartbeat.agentId)
      if (agent) {
        agent.lastHeartbeat = heartbeat.ts
        agent.status = heartbeat.status
        agent.currentTask = heartbeat.currentTask
        agent.tasksCompleted = heartbeat.tasksCompleted
        agent.tasksFailed = heartbeat.tasksFailed
        agent.avgTaskMs = heartbeat.avgTaskMs
      }
    })

    logger.info('Orchestrator', `Cluster started with ${this.config.agentCount} agents`)
  }

  /** Graceful shutdown. */
  async shutdown(): Promise<void> {
    this.running = false

    // Abort all agent loops
    for (const [agentId, ctrl] of this.abortControllers) {
      ctrl.abort()
    }

    // Wait for agents to finish current tasks (with timeout)
    const timeout = 10000
    const deadline = Date.now() + timeout
    for (const [agentId, task] of this.agentTasks) {
      const remaining = deadline - Date.now()
      if (remaining > 0) {
        try {
          await Promise.race([
            task,
            new Promise(r => setTimeout(r, remaining)),
          ])
        } catch { /* agent task errors are OK during shutdown */ }
      }
    }

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.stateSyncTimer) clearInterval(this.stateSyncTimer)

    this.agentTasks.clear()
    this.abortControllers.clear()

    logger.info('Orchestrator', 'Cluster shut down')
  }

  // ============================================
  // Agent loop
  // ============================================

  private startAgentLoop(agentId: AgentId): void {
    const ctrl = new AbortController()
    this.abortControllers.set(agentId, ctrl)

    const loop = this.agentLoop(agentId, ctrl.signal)
    this.agentTasks.set(agentId, loop)

    // Clean up on completion — only if this is still the active controller/loop
    loop.finally(() => {
      if (this.abortControllers.get(agentId) === ctrl) {
        this.abortControllers.delete(agentId)
      }
      if (this.agentTasks.get(agentId) === loop) {
        this.agentTasks.delete(agentId)
      }
    })
  }

  private async agentLoop(agentId: AgentId, signal: AbortSignal): Promise<void> {
    const agent = this.agents.get(agentId)
    if (!agent) return

    agent.uptime = 0
    const loopStart = Date.now()

    while (!signal.aborted && this.running) {
      agent.uptime = Date.now() - loopStart

      // 1. Try to get work
      const task = this.queue.getWork(agentId)

      if (!task) {
        // No work — idle and wait
        agent.status = 'idle'
        agent.currentTask = null
        this.sendHeartbeat(agentId)
        await this.sleep(200 + Math.random() * 300) // 200-500ms backoff
        continue
      }

      // 2. Check idempotency
      const inputHash = JSON.stringify(task.input)
      const idemCheck = checkIdempotency(inputHash)
      if (idemCheck.processed && idemCheck.result) {
        // Already processed — skip
        task.status = 'skipped'
        task.result = {
          taskId: task.id,
          agentId,
          success: true,
          output: idemCheck.result.output as string || '(cached)',
          tokensUsed: 0,
          durationMs: 0,
          errors: [],
          warnings: [],
        }
        this.queue.complete(task.id)
        this.bus.publish(createEvent('task:skipped', { taskId: task.id, reason: 'idempotency' }, agentId))
        continue
      }

      // 3. Execute
      agent.status = 'working'
      agent.currentTask = task.id
      agent.role = task.role
      agent.roleHistory.push({ role: task.role, ts: Date.now() })
      if (agent.roleHistory.length > 20) agent.roleHistory.shift()

      task.status = 'running'
      task.assignedAgent = agentId
      task.startedAt = Date.now()

      this.bus.publish(createEvent('task:started', { taskId: task.id, agentId, type: task.type }, agentId))
      this.sendHeartbeat(agentId)

      // Send heartbeats during long task execution
      const taskHeartbeat = setInterval(() => this.sendHeartbeat(agentId), this.config.heartbeatIntervalMs)

      const startMs = Date.now()
      let result: TaskResult

      try {
        const handler = getRoleHandler(task.type)
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Task timeout')), task.timeout || this.config.taskTimeoutMs)
        )

        const timeoutSignal = task.timeout > 0
        result = timeoutSignal
          ? await Promise.race([handler(task, agentId), timeoutPromise])
          : await handler(task, agentId)

        const durationMs = Date.now() - startMs
        result.durationMs = durationMs

        // Rolling average
        agent.tasksCompleted++
        agent.avgTaskMs = agent.avgTaskMs * 0.9 + durationMs * 0.1

        task.status = 'completed'
        task.result = result
        task.completedAt = Date.now()

        this.queue.complete(task.id)
        recordIdempotency(inputHash, task.id, { output: result.output })

        this.bus.publish(createEvent('task:completed', { task, result }, agentId))
        this.bus.publish(createEvent('cluster:taskCompleted', { agentId, taskType: task.type, durationMs }, agentId))
        this.resolvePendingTask(task.id, result)

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        const durationMs = Date.now() - startMs

        agent.tasksFailed++
        task.retryCount++

        if (task.retryCount < task.maxRetries) {
          // Requeue for retry
          task.status = 'pending'
          task.assignedAgent = null
          this.queue.push(agentId, task) // Push back to own queue
          this.bus.publish(createEvent('task:retrying', { taskId: task.id, agentId, retry: task.retryCount, error: errorMsg }, agentId))
        } else {
          // Final failure
          task.status = 'failed'
          task.error = errorMsg
          task.completedAt = Date.now()
          result = {
            taskId: task.id,
            agentId,
            success: false,
            output: '',
            tokensUsed: 0,
            durationMs,
            errors: [errorMsg],
            warnings: [],
          }
          task.result = result
          this.queue.complete(task.id)
        }

        this.bus.publish(createEvent('task:failed', { taskId: task.id, agentId, error: errorMsg }, agentId))
        this.resolvePendingTask(task.id, {
          taskId: task.id, agentId, success: false, output: '', tokensUsed: 0,
          durationMs: Date.now() - startMs, errors: [errorMsg], warnings: [],
        })
      } finally {
        clearInterval(taskHeartbeat)
      }

      agent.currentTask = null
      this.sendHeartbeat(agentId)

      // Yield to event loop (let other agents run)
      await this.sleep(0)
    }

    agent.status = 'dead'
    this.sendHeartbeat(agentId)
  }

  // ============================================
  // Heartbeat
  // ============================================

  private sendHeartbeat(agentId: AgentId): void {
    const agent = this.agents.get(agentId)
    if (!agent) return

    agent.lastHeartbeat = Date.now()

    const heartbeat: AgentHeartbeat = {
      agentId,
      status: agent.status,
      currentTask: agent.currentTask,
      queueDepth: this.queue.getAgentQueueDepth(agentId),
      tasksCompleted: agent.tasksCompleted,
      tasksFailed: agent.tasksFailed,
      avgTaskMs: Math.round(agent.avgTaskMs),
      ts: Date.now(),
    }

    this.bus.publish(createEvent('agent:heartbeat', heartbeat, agentId))
  }

  private checkHeartbeats(): void {
    if (!this.running) return  // Don't check during shutdown
    const now = Date.now()
    const timeout = this.config.heartbeatIntervalMs * 3 // 3x interval = dead

    for (const [agentId, agent] of this.agents) {
      if (agent.status === 'dead') continue

      if (now - agent.lastHeartbeat > timeout) {
        logger.warn('Orchestrator', `Agent ${agentId} appears dead (last heartbeat ${now - agent.lastHeartbeat}ms ago)`)
        agent.status = 'restarting'

        // Cancel old loop, start new one
        const oldCtrl = this.abortControllers.get(agentId)
        if (oldCtrl) oldCtrl.abort()

        // Reset agent state
        agent.currentTask = null
        agent.roleHistory = []

        this.startAgentLoop(agentId)

        const restartEvent = createEvent('agent:restarted', { agentId, reason: 'heartbeat_timeout' }, 'orchestrator')
        this.bus.publish(restartEvent)
      }
    }
  }

  // ============================================
  // Task submission
  // ============================================

  /** Submit a single task directly to the queue. */
  submitTask(
    type: TaskType,
    role: AgentRole,
    input: TaskInput,
    priority: number = 0.5,
    parentWorkflowId: string | null = null,
  ): string {
    const task: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      priority: Math.max(0, Math.min(1, priority)),
      role,
      input,
      parentWorkflowId,
      parentTaskId: null,
      status: 'pending',
      assignedAgent: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      timeout: this.config.taskTimeoutMs,
      metadata: {},
    }

    this.queue.pushBatch([task])
    this.bus.publish(createEvent('task:created', { taskId: task.id, type, priority }, parentWorkflowId || 'system'))
    return task.id
  }

  /** Submit a high-level goal: decompose → workflow DAG → enqueue tasks. */
  async submitGoal(goal: string, context?: string): Promise<string> {
    // 1. Decompose goal into a workflow plan
    const decomTask: Task = {
      id: `decomp_${Date.now()}`,
      type: 'decompose',
      priority: 1.0,
      role: 'general',
      input: { query: goal, context: context || '' },
      parentWorkflowId: null,
      parentTaskId: null,
      status: 'pending',
      assignedAgent: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: null,
      retryCount: 0,
      maxRetries: 1,
      timeout: 30000,
      metadata: {},
    }

    const handler = getRoleHandler('decompose')
    const result = await handler(decomTask, 'orchestrator')

    let hints: DecompositionHint

    if (result.structuredOutput && result.structuredOutput.subtasks) {
      const plan = result.structuredOutput
      hints = {
        label: plan.name || goal.slice(0, 50),
        type: plan.type === 'parallel' ? 'parallel' : 'sequential',
        children: (plan.subtasks as Array<Record<string, unknown>>).map((st: Record<string, unknown>) => ({
          label: String(st.label || st.query || 'task'),
          type: 'task' as const,
          taskType: (st.type as TaskType) || 'research',
          taskInput: {
            query: String(st.query || st.label || ''),
            priority: typeof st.priority === 'number' ? st.priority : 0.7,
          },
        })),
      }
    } else {
      hints = {
        label: goal.slice(0, 50),
        type: 'sequential',
        children: [{
          label: goal.slice(0, 50),
          type: 'task',
          taskType: 'research',
          taskInput: { query: goal },
        }],
      }
    }

    // 2. Build workflow
    const workflow = buildWorkflowFromHints(goal.slice(0, 80), goal, hints)

    this.bus.publish(createEvent('workflow:created', {
      workflowId: workflow.id,
      name: workflow.name,
      taskCount: 0, // updated after execution
    }, 'orchestrator'))

    // 3. Execute workflow via DAG engine (fire-and-forget)
    executeWorkflow(workflow, async (node, workflowCtx) => {
      const taskType = node.taskTemplate?.type || 'research'
      const role = node.taskTemplate?.role || this.mapTaskTypeToRole(taskType)
      const taskId = this.submitTask(
        taskType,
        role,
        {
          query: node.taskTemplate?.input?.query || node.label,
          context: context ? `${context}\n${JSON.stringify(workflowCtx.variables)}` : JSON.stringify(workflowCtx.variables),
          ...node.taskTemplate?.input,
        },
        node.taskTemplate?.priority ?? 0.7,
        workflow.id,
      )
      return this.waitForTask(taskId)
    }, { variables: { goal, userContext: context } })
      .then((execResult) => {
        logger.info('Orchestrator',
          `Workflow ${execResult.workflowId} ${execResult.success ? 'completed' : 'failed'} ` +
          `in ${execResult.durationMs}ms, ${execResult.results.size} results`)
      })
      .catch((err) => {
        logger.error('Orchestrator', `Workflow ${workflow.id} execution error:`, err)
      })

    logger.info('Orchestrator', `Goal "${goal.slice(0, 50)}" → workflow ${workflow.id}`)
    return workflow.id
  }

  private resolvePendingTask(taskId: string, result: TaskResult): void {
    const pending = this.pendingTaskPromises.get(taskId)
    if (pending) {
      this.pendingTaskPromises.delete(taskId)
      pending.resolve(result)
    }
  }

  private waitForTask(taskId: string, timeoutMs: number = 120000): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      this.pendingTaskPromises.set(taskId, { resolve, reject })
      setTimeout(() => {
        if (this.pendingTaskPromises.has(taskId)) {
          this.pendingTaskPromises.delete(taskId)
          reject(new Error(`Task ${taskId} timed out after ${timeoutMs}ms`))
        }
      }, timeoutMs)
    })
  }

  // ============================================
  // State queries
  // ============================================

  /** Get full cluster state snapshot. */
  getState(): ClusterState {
    const queueStats = this.queue.getStats()

    return {
      config: { ...this.config },
      agents: new Map(this.agents),
      queueStats,
      workflowCount: 0, // Tracked via bus events
      activeWorkflows: [], // Tracked via bus events
      uptime: Date.now() - this.startedAt,
      totalTasksCompleted: queueStats.totalCompleted,
      totalTasksFailed: queueStats.totalFailed,
      avgThroughput: this.calculateThroughput(),
    }
  }

  /** Get simplified agent list for UI. */
  getAgentList(): AgentInfo[] {
    return [...this.agents.values()].map(a => ({ ...a }))
  }

  /** Get queue statistics. */
  getQueueStats(): QueueStats {
    return this.queue.getStats()
  }

  /** Get recent events for a topic. */
  getEvents(topic: string, limit?: number): ClusterEvent[] {
    return this.bus.getHistory(topic, limit)
  }

  /** Is the cluster running? */
  get isRunning(): boolean {
    return this.running
  }

  // ============================================
  // Internal
  // ============================================

  private sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }

  private mapTaskTypeToRole(type: TaskType): AgentRole {
    switch (type) {
      case 'research': return 'research'
      case 'code-gen': return 'code-gen'
      case 'code-review': return 'code-review'
      case 'memory-extract': return 'memory'
      case 'evolution': return 'evolution'
      case 'verify': return 'verify'
      case 'monitor-check': return 'monitor'
      case 'decompose': return 'general'
      case 'synthesize': return 'general'
      default: return 'general'
    }
  }

  private syncState(): void {
    // Persist agent states to SQLite for crash recovery
    for (const [id, agent] of this.agents) {
      upsertAgentState({
        agent_id: id,
        status: agent.status,
        current_task: agent.currentTask,
        tasks_completed: agent.tasksCompleted,
        tasks_failed: agent.tasksFailed,
        avg_task_ms: agent.avgTaskMs,
        last_heartbeat: new Date(agent.lastHeartbeat).toISOString(),
        role: agent.role,
      })
    }
  }

  private calculateThroughput(): number {
    const elapsedMin = (Date.now() - this.startedAt) / 60000
    if (elapsedMin < 0.1) return 0
    return Math.round(this.queue.getStats().totalCompleted / elapsedMin * 10) / 10
  }
}

// ============================================
// Singleton
// ============================================

let orchestratorInstance: ClusterOrchestrator | null = null

export function getOrchestrator(config?: Partial<ClusterConfig>): ClusterOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ClusterOrchestrator(config)
  }
  return orchestratorInstance
}

export async function startCluster(config?: Partial<ClusterConfig>): Promise<ClusterOrchestrator> {
  const orch = getOrchestrator(config)
  await orch.start()
  return orch
}

export async function stopCluster(): Promise<void> {
  if (orchestratorInstance) {
    await orchestratorInstance.shutdown()
    orchestratorInstance = null
  }
}
