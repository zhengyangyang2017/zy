import { describe, it, expect, beforeEach } from 'vitest'
import { WorkStealingQueue } from './task-queue'
import type { Task, TaskType, AgentRole } from './types'

function makeTask(id: string, priority: number = 0.5, type: TaskType = 'research'): Task {
  return {
    id,
    type,
    priority,
    role: 'general' as AgentRole,
    input: { query: 'test' },
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
}

describe('WorkStealingQueue', () => {
  let q: WorkStealingQueue

  beforeEach(() => {
    q = new WorkStealingQueue()
  })

  it('pushes and pops from same agent deque', () => {
    q.registerAgent('agent_1')
    const task = makeTask('task_1')
    q.push('agent_1', task)
    expect(q.totalPending).toBe(1)

    const popped = q.pop('agent_1')
    expect(popped?.id).toBe('task_1')
    expect(q.totalPending).toBe(0)
  })

  it('steals from busiest agent', () => {
    q.registerAgent('agent_1')
    q.registerAgent('agent_2')

    // agent_1 has 3 tasks, agent_2 has 1
    q.push('agent_1', makeTask('a1_1'))
    q.push('agent_1', makeTask('a1_2'))
    q.push('agent_1', makeTask('a1_3'))
    q.push('agent_2', makeTask('a2_1'))

    // agent_2 steals from agent_1 (who has 3 tasks)
    const stolen = q.steal('agent_2')
    expect(stolen).not.toBeNull()
    expect(stolen!.id).toBe('a1_1') // stolen from tail (oldest)
    expect(q.getAgentQueueDepth('agent_1')).toBe(2)
  })

  it('getWork tries own deque first, then steals', () => {
    q.registerAgent('agent_1')
    q.registerAgent('agent_2')

    // agent_1 has tasks, agent_2 is empty
    q.push('agent_1', makeTask('a1_1'))
    q.push('agent_1', makeTask('a1_2'))

    // agent_2 getWork: own deque empty → steals from agent_1
    const work = q.getWork('agent_2')
    expect(work).not.toBeNull()
    expect(work!.id).toBe('a1_1') // stolen from tail
  })

  it('pushBatch distributes round-robin', () => {
    q.registerAgent('agent_1')
    q.registerAgent('agent_2')

    const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3'), makeTask('t4')]
    q.pushBatch(tasks)

    expect(q.getAgentQueueDepth('agent_1')).toBe(2)
    expect(q.getAgentQueueDepth('agent_2')).toBe(2)
  })

  it('tracks task by ID', () => {
    q.registerAgent('agent_1')
    const task = makeTask('task_x')
    q.push('agent_1', task)

    const found = q.getTask('task_x')
    expect(found?.id).toBe('task_x')
  })

  it('complete moves task to completed', () => {
    q.registerAgent('agent_1')
    const task = makeTask('task_done')
    q.push('agent_1', task)
    q.pop('agent_1')
    q.complete('task_done')

    const stats = q.getStats()
    expect(stats.totalCompleted).toBe(1)
    expect(stats.totalPending).toBe(0)
  })

  it('getStats returns correct counts', () => {
    q.registerAgent('agent_1')
    q.registerAgent('agent_2')

    q.push('agent_1', makeTask('t1', 0.9, 'research'))
    q.push('agent_1', makeTask('t2', 0.5, 'code-gen'))
    q.push('agent_2', makeTask('t3', 0.2, 'verify'))

    const stats = q.getStats()
    expect(stats.totalPending).toBe(3)
    expect(stats.byPriority.high).toBe(1)  // 0.9
    expect(stats.byPriority.medium).toBe(1) // 0.5
    expect(stats.byPriority.low).toBe(1)   // 0.2
  })

  it('unregisterAgent redistributes tasks', () => {
    q.registerAgent('agent_1')
    q.registerAgent('agent_2')
    q.push('agent_1', makeTask('t1'))
    q.push('agent_1', makeTask('t2'))

    q.unregisterAgent('agent_1')
    // agent_1's tasks should be redistributed to agent_2
    expect(q.getAgentQueueDepth('agent_2')).toBe(2)
  })
})
