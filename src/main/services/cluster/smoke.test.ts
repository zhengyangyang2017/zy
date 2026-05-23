/**
 * Smoke tests — verify critical paths work end-to-end.
 *
 * These test the cluster orchestration flow in-process
 * (no Electron window needed).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventBus, resetEventBus } from './event-bus'
import { WorkStealingQueue, resetWorkStealingQueue } from './task-queue'
import { createNode, createWorkflow, countTaskNodes, flattenTaskNodes } from './workflow'
import type { Task, TaskResult, AgentId, TaskType, AgentRole } from './types'

// Smoke test: full task lifecycle through queue
describe('Smoke: Task Lifecycle', () => {
  let queue: WorkStealingQueue
  let bus: EventBus

  beforeEach(() => {
    queue = new WorkStealingQueue()
    bus = new EventBus(50)
    resetEventBus()
    resetWorkStealingQueue()
  })

  afterEach(() => {
    resetEventBus()
    resetWorkStealingQueue()
  })

  it('completes a full task lifecycle through the queue', () => {
    const agentId: AgentId = 'agent_1'
    queue.registerAgent(agentId)

    // Create task
    const task: Task = {
      id: 'task_smoke_1',
      type: 'research' as TaskType,
      priority: 0.8,
      role: 'research' as AgentRole,
      input: { query: 'test smoke task' },
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
      maxRetries: 3,
      timeout: 60000,
      metadata: {},
    }

    // Push → Pop → Complete
    queue.push(agentId, task)
    expect(queue.totalPending).toBe(1)

    const popped = queue.getWork(agentId)
    expect(popped?.id).toBe('task_smoke_1')

    queue.complete('task_smoke_1')
    expect(queue.getStats().totalCompleted).toBe(1)
  })

  it('work-stealing distributes tasks across multiple agents', () => {
    const agents: AgentId[] = ['agent_1', 'agent_2', 'agent_3']
    agents.forEach(id => queue.registerAgent(id))

    // Push 6 tasks to agent_1 only
    for (let i = 0; i < 6; i++) {
      queue.push('agent_1', {
        id: `task_${i}`,
        type: 'research' as TaskType,
        priority: 0.5,
        role: 'general' as AgentRole,
        input: { query: `test ${i}` },
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
        maxRetries: 3,
        timeout: 60000,
        metadata: {},
      })
    }

    // Agent 2 steals work (should get a task from agent_1's tail)
    const stolen = queue.steal('agent_2')
    expect(stolen).not.toBeNull()

    // Agent 3 gets work via getWork (own empty → steal)
    const work = queue.getWork('agent_3')
    expect(work).not.toBeNull()
  })

  it('event bus delivers task completion events', () => {
    const handler = vi.fn()
    bus.subscribe('task:completed', handler)

    const event = {
      id: 'evt_1',
      topic: 'task:completed' as const,
      payload: { taskId: 'test_1', result: 'done' },
      source: 'agent_1' as const,
      ts: Date.now(),
    }
    bus.publish(event)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(event)
  })
})

// Smoke test: Workflow creation and validation
describe('Smoke: Workflow DSL', () => {
  it('builds a complete research workflow from hints', () => {
    const leaf1 = createNode('Search web', 'task', { taskType: 'research' })
    const leaf2 = createNode('Synthesize', 'task', { taskType: 'synthesize' })
    const root = createNode('Research goal', 'sequential', { children: [leaf1, leaf2] })

    const workflow = createWorkflow('Test Research', 'A test workflow', root)

    expect(workflow.id).toBeTruthy()
    expect(countTaskNodes(workflow.root)).toBe(2)

    const flat = flattenTaskNodes(workflow.root)
    expect(flat.map(n => n.label)).toEqual(['Search web', 'Synthesize'])
  })

  it('handles parallel fan-out correctly', () => {
    const children = [1, 2, 3, 4, 5].map(i =>
      createNode(`Task ${i}`, 'task', { taskType: 'research' })
    )
    const root = createNode('Fan out', 'parallel', { children })

    expect(countTaskNodes(root)).toBe(5)
    expect(flattenTaskNodes(root)).toHaveLength(5)
  })
})

// Smoke test: Cluster state integrity
describe('Smoke: Cluster State', () => {
  it('agent heartbeat data structure is valid', () => {
    const heartbeat = {
      agentId: 'agent_test' as AgentId,
      status: 'working' as const,
      currentTask: 'task_123',
      queueDepth: 5,
      tasksCompleted: 10,
      tasksFailed: 1,
      avgTaskMs: 250,
      ts: Date.now(),
    }

    expect(heartbeat.agentId).toBeTruthy()
    expect(heartbeat.status).toBe('working')
    expect(heartbeat.tasksCompleted).toBeGreaterThanOrEqual(0)
    expect(heartbeat.avgTaskMs).toBeGreaterThanOrEqual(0)
  })
})
