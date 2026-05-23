/**
 * Work-Stealing Priority Task Queue.
 *
 * Each agent has its own deque (double-ended queue).
 * Agents push/pop from the front of their own deque.
 * Idle agents steal from the back of the busiest agent's deque.
 *
 * This minimizes contention: owners only touch front, thieves only touch back.
 */

import type { Task, TaskType, AgentId, QueueStats } from './types'

interface DequeNode {
  task: Task
  prev: DequeNode | null
  next: DequeNode | null
}

interface AgentDeque {
  agentId: AgentId
  head: DequeNode | null
  tail: DequeNode | null
  size: number
}

export class WorkStealingQueue {
  private deques: Map<AgentId, AgentDeque> = new Map()
  private taskIndex: Map<string, DequeNode> = new Map() // taskId -> node lookup
  private completedTasks: Map<string, Task> = new Map()
  private inFlightTasks: Map<string, Task> = new Map()
  private stealCounter = 0
  private totalWaitTime = 0
  private totalWaitCount = 0

  /** Register an agent's deque. */
  registerAgent(agentId: AgentId): void {
    if (!this.deques.has(agentId)) {
      this.deques.set(agentId, {
        agentId,
        head: null,
        tail: null,
        size: 0,
      })
    }
  }

  /** Unregister an agent's deque. Redistribute pending tasks. */
  unregisterAgent(agentId: AgentId): void {
    const deque = this.deques.get(agentId)
    if (!deque) return

    // Redistribute pending tasks to other agents
    const others = [...this.deques.keys()].filter(id => id !== agentId)
    if (others.length > 0) {
      let node = deque.head
      while (node) {
        const targetId = others[Math.floor(Math.random() * others.length)]
        const targetDeque = this.deques.get(targetId)!
        const next: DequeNode | null = node.next
        node.prev = targetDeque.tail
        node.next = null
        if (targetDeque.tail) targetDeque.tail.next = node
        targetDeque.tail = node
        if (!targetDeque.head) targetDeque.head = node
        targetDeque.size++
        node = next
      }
    }

    this.deques.delete(agentId)
  }

  /** Push a task to a specific agent's deque front. */
  push(agentId: AgentId, task: Task): void {
    const deque = this.ensureDeque(agentId)
    const node: DequeNode = { task, prev: null, next: deque.head }
    if (deque.head) {
      deque.head.prev = node
    }
    deque.head = node
    if (!deque.tail) {
      deque.tail = node
    }
    deque.size++
    this.taskIndex.set(task.id, node)
  }

  /** Push a batch of tasks, distributed round-robin across agents. */
  pushBatch(tasks: Task[]): void {
    if (tasks.length === 0) return
    const agentIds = [...this.deques.keys()]
    if (agentIds.length === 0) {
      // No agents registered yet, queue to a pending pool
      // Register a temporary bucket
      this.deques.set('__pending__', { agentId: '__pending__', head: null, tail: null, size: 0 })
    }
    const ids = agentIds.length > 0 ? agentIds : ['__pending__']
    tasks.forEach((task, i) => {
      this.push(ids[i % ids.length], task)
    })
  }

  /** Pop a task from own deque front (agent claims its own work). */
  pop(agentId: AgentId): Task | null {
    const deque = this.deques.get(agentId)
    if (!deque || !deque.head) return null

    const node = deque.head
    deque.head = node.next
    if (deque.head) {
      deque.head.prev = null
    } else {
      deque.tail = null
    }
    deque.size--

    const task = node.task
    this.taskIndex.delete(task.id)
    this.inFlightTasks.set(task.id, task)

    // Track wait time
    const waitMs = Date.now() - task.createdAt
    this.totalWaitTime += waitMs
    this.totalWaitCount++

    return task
  }

  /** Try to steal a task from another agent's deque back. */
  steal(thiefId: AgentId): Task | null {
    // Find the busiest agent (most tasks queued), excluding self
    let bestTarget: AgentDeque | null = null
    let bestSize = 0

    for (const [id, deque] of this.deques) {
      if (id !== thiefId && deque.size > bestSize) {
        bestSize = deque.size
        bestTarget = deque
      }
    }

    if (!bestTarget || !bestTarget.tail) return null

    // Steal from the tail (back of deque)
    const node = bestTarget.tail
    bestTarget.tail = node.prev
    if (bestTarget.tail) {
      bestTarget.tail.next = null
    } else {
      bestTarget.head = null
    }
    bestTarget.size--

    this.stealCounter++
    this.taskIndex.delete(node.task.id)
    this.inFlightTasks.set(node.task.id, node.task)
    return node.task
  }

  /** Try to get work: first from own deque, then steal. */
  getWork(agentId: AgentId): Task | null {
    // First try own deque
    const own = this.pop(agentId)
    if (own) return own

    // Try steal from others
    return this.steal(agentId)
  }

  /** Mark a task as completed. */
  complete(taskId: string): void {
    // Check all sources for the task
    const node = this.taskIndex.get(taskId)
    let task = node?.task || this.inFlightTasks.get(taskId) || this.completedTasks.get(taskId)

    if (task) {
      task.status = 'completed'
      task.completedAt = Date.now()
    }

    // Move from in-flight to completed for stats
    if (task) {
      this.inFlightTasks.delete(taskId)
      this.completedTasks.set(taskId, task)
      if (this.completedTasks.size > 500) {
        const first = this.completedTasks.keys().next().value
        if (first) this.completedTasks.delete(first)
      }
    }
  }

  /** Get a task by ID (searches active + in-flight + completed). */
  getTask(taskId: string): Task | undefined {
    const node = this.taskIndex.get(taskId)
    if (node) return node.task
    return this.inFlightTasks.get(taskId) || this.completedTasks.get(taskId)
  }

  /** Get queue stats. */
  getStats(): QueueStats {
    let totalPending = 0
    let totalRunning = 0
    const byType: Record<string, number> = {}

    for (const deque of this.deques.values()) {
      let node = deque.head
      while (node) {
        if (node.task.status === 'pending') {
          totalPending++
          byType[node.task.type] = (byType[node.task.type] || 0) + 1
        } else if (node.task.status === 'running') {
          totalRunning++
        }
        node = node.next
      }
    }

    // Priority buckets
    let high = 0, medium = 0, low = 0
    for (const deque of this.deques.values()) {
      let node = deque.head
      while (node) {
        if (node.task.status === 'pending') {
          if (node.task.priority >= 0.7) high++
          else if (node.task.priority >= 0.3) medium++
          else low++
        }
        node = node.next
      }
    }

    return {
      totalPending,
      totalRunning,
      totalCompleted: this.completedTasks.size,
      totalFailed: 0, // Tracked separately
      avgWaitMs: this.totalWaitCount > 0
        ? Math.round(this.totalWaitTime / this.totalWaitCount)
        : 0,
      stealCount: this.stealCounter,
      byType: byType as Record<TaskType, number>,
      byPriority: { high, medium, low },
    }
  }

  /** Get pending task count for an agent. */
  getAgentQueueDepth(agentId: AgentId): number {
    return this.deques.get(agentId)?.size ?? 0
  }

  /** Total pending tasks across all agents. */
  get totalPending(): number {
    let count = 0
    for (const deque of this.deques.values()) {
      count += deque.size
    }
    return count
  }

  /** Total agents registered. */
  get agentCount(): number {
    return this.deques.size
  }

  private ensureDeque(agentId: AgentId): AgentDeque {
    let deque = this.deques.get(agentId)
    if (!deque) {
      deque = { agentId, head: null, tail: null, size: 0 }
      this.deques.set(agentId, deque)
    }
    return deque
  }
}

/** Singleton. */
let queueInstance: WorkStealingQueue | null = null

export function getWorkStealingQueue(): WorkStealingQueue {
  if (!queueInstance) {
    queueInstance = new WorkStealingQueue()
  }
  return queueInstance
}

export function resetWorkStealingQueue(): void {
  queueInstance = null
}
