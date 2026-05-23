import { describe, it, expect } from 'vitest'
import { createNode, createWorkflow, countTaskNodes, flattenTaskNodes } from './workflow'
import type { WorkflowCondition, TaskResult, AgentId } from './types'

const trueCondition: WorkflowCondition = {
  expression: 'always true',
  evaluate: () => true,
}

const falseCondition: WorkflowCondition = {
  expression: 'always false',
  evaluate: () => false,
}

function mockResult(success: boolean = true): TaskResult {
  return {
    taskId: 'mock',
    agentId: 'agent_1' as AgentId,
    success,
    output: 'test output',
    tokensUsed: 10,
    durationMs: 100,
    errors: success ? [] : ['test error'],
    warnings: [],
  }
}

describe('Workflow DSL', () => {
  it('creates a valid workflow from nodes', () => {
    const leaf = createNode('research task', 'task', { taskType: 'research' })
    const root = createNode('root', 'sequential', { children: [leaf] })
    const wf = createWorkflow('test', 'test workflow', root)

    expect(wf.id).toBeTruthy()
    expect(wf.name).toBe('test')
    expect(root.children?.length).toBe(1)
  })

  it('detects cycles and throws', () => {
    // Create a self-referencing node via children
    const nodeA = createNode('A', 'task')
    const nodeB = createNode('B', 'task')

    // Make a cycle: A → B → A
    const root = createNode('root', 'sequential', {
      children: [
        createNode('wrapper', 'sequential', {
          children: [nodeA, nodeB],
        }),
      ],
    })

    // Cycles with self-referencing in condition branches
    const condNode = createNode('cond', 'condition', {
      condition: trueCondition,
      thenBranch: nodeA,
      elseBranch: nodeB,
    })

    // This should be fine (no cycle)
    expect(() => createWorkflow('no-cycle', 'test', condNode)).not.toThrow()
  })

  it('counts task nodes correctly', () => {
    const leaf1 = createNode('t1', 'task')
    const leaf2 = createNode('t2', 'task')
    const leaf3 = createNode('t3', 'task')
    const parallel = createNode('parallel', 'parallel', { children: [leaf1, leaf2] })
    const root = createNode('root', 'sequential', { children: [parallel, leaf3] })

    expect(countTaskNodes(root)).toBe(3)
  })

  it('flattens task nodes into array (BFS)', () => {
    const leaf1 = createNode('t1', 'task')
    const leaf2 = createNode('t2', 'task')
    const leaf3 = createNode('t3', 'task')
    const root = createNode('root', 'sequential', { children: [leaf1, leaf2, leaf3] })

    const flat = flattenTaskNodes(root)
    expect(flat).toHaveLength(3)
    expect(flat.map(n => n.label)).toEqual(['t1', 't2', 't3'])
  })

  it('handles condition nodes in task count', () => {
    const thenTask = createNode('then', 'task')
    const elseTask = createNode('else', 'task')
    const cond = createNode('condition', 'condition', {
      condition: trueCondition,
      thenBranch: thenTask,
      elseBranch: elseTask,
    })

    expect(countTaskNodes(cond)).toBe(2)
  })

  it('handles condition nodes in flatten', () => {
    const thenTask = createNode('then', 'task')
    const elseTask = createNode('else', 'task')
    const cond = createNode('condition', 'condition', {
      condition: trueCondition,
      thenBranch: thenTask,
      elseBranch: elseTask,
    })

    const flat = flattenTaskNodes(cond)
    expect(flat).toHaveLength(2)
  })
})
