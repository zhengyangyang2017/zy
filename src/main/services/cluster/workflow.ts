/**
 * Workflow DSL Engine — DAG-based task orchestration.
 *
 * Node types:
 * - sequential: execute children in order
 * - parallel: execute all children concurrently (fan-out)
 * - condition: branch based on context
 * - task: leaf node, enqueues a single task
 *
 * Features:
 * - Cycle detection on build
 * - Topological execution
 * - Context propagation (upstream results → downstream inputs)
 * - Failure handling (stop-on-error or continue)
 */

import type {
  WorkflowNode,
  WorkflowDefinition,
  WorkflowContext,
  WorkflowCondition,
  Task,
  TaskInput,
  TaskResult,
  TaskType,
  AgentRole,
  TaskPriority,
} from './types'

// ============================================
// Builder
// ============================================

let nodeCounter = 0

export function createNode(
  label: string,
  type: WorkflowNode['type'] = 'task',
  opts?: {
    children?: WorkflowNode[]
    condition?: WorkflowCondition
    thenBranch?: WorkflowNode
    elseBranch?: WorkflowNode
    taskType?: TaskType
    taskRole?: AgentRole
    taskPriority?: TaskPriority
    taskInput?: Partial<TaskInput>
    taskMetadata?: Record<string, unknown>
  }
): WorkflowNode {
  const node: WorkflowNode = {
    id: `wfnode_${++nodeCounter}`,
    type,
    label,
    status: 'pending',
  }

  if (type === 'task') {
    node.taskTemplate = {
      type: opts?.taskType || 'custom',
      role: opts?.taskRole || 'general',
      priority: opts?.taskPriority ?? 0.5,
      input: opts?.taskInput || {},
      metadata: opts?.taskMetadata || {},
    }
  } else if (type === 'parallel' || type === 'sequential') {
    node.children = opts?.children || []
  } else if (type === 'condition') {
    node.condition = opts?.condition
    node.thenBranch = opts?.thenBranch
    node.elseBranch = opts?.elseBranch
  }

  return node
}

export function createWorkflow(
  name: string,
  description: string,
  root: WorkflowNode,
): WorkflowDefinition {
  // Validate DAG
  const cycles = detectCycles(root)
  if (cycles.length > 0) {
    throw new Error(`Workflow "${name}" has cycles: ${cycles.join(' → ')}`)
  }

  return {
    id: `wf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    description,
    root,
    createdAt: Date.now(),
    createdBy: 'orchestrator',
  }
}

// ============================================
// Cycle detection (DFS)
// ============================================

function detectCycles(root: WorkflowNode): string[] {
  const visited = new Set<string>()
  const stack = new Set<string>()
  const path: string[] = []

  function dfs(node: WorkflowNode): boolean {
    if (stack.has(node.id)) {
      path.push(node.id)
      return true // cycle found
    }
    if (visited.has(node.id)) return false

    visited.add(node.id)
    stack.add(node.id)
    path.push(node.id)

    const children = node.type === 'condition'
      ? [node.thenBranch, node.elseBranch].filter(Boolean) as WorkflowNode[]
      : (node.children || [])

    for (const child of children) {
      if (dfs(child)) return true
    }

    stack.delete(node.id)
    path.pop()
    return false
  }

  if (dfs(root)) return path
  return []
}

// ============================================
// Execution
// ============================================

export interface WorkflowExecutionResult {
  workflowId: string
  success: boolean
  results: Map<string, TaskResult>
  errors: string[]
  durationMs: number
}

export type TaskEmitter = (node: WorkflowNode, context: WorkflowContext) => Promise<TaskResult>

/**
 * Execute a workflow by walking the DAG.
 * `emitTask` is called for each 'task' leaf node and should enqueue it.
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  emitTask: TaskEmitter,
  initialContext?: Partial<WorkflowContext>,
): Promise<WorkflowExecutionResult> {
  const context: WorkflowContext = {
    workflowId: workflow.id,
    variables: initialContext?.variables || {},
    nodeResults: new Map(),
    startedAt: Date.now(),
  }

  const errors: string[] = []

  try {
    await executeNode(workflow.root, context, emitTask, errors)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
  }

  const allSucceeded = errors.length === 0
    && workflow.root.status === 'completed'

  return {
    workflowId: workflow.id,
    success: allSucceeded,
    results: context.nodeResults,
    errors,
    durationMs: Date.now() - context.startedAt,
  }
}

async function executeNode(
  node: WorkflowNode,
  context: WorkflowContext,
  emitTask: TaskEmitter,
  errors: string[],
): Promise<void> {
  if (node.status === 'completed' || node.status === 'failed') return

  node.startedAt = Date.now()
  node.status = 'running'

  try {
    switch (node.type) {
      case 'task': {
        const result = await emitTask(node, context)
        node.result = result
        node.status = result.success ? 'completed' : 'failed'
        node.completedAt = Date.now()
        context.nodeResults.set(node.id, result)
        if (!result.success) {
          errors.push(`Task "${node.label}" failed: ${result.errors.join('; ')}`)
        }
        break
      }

      case 'sequential': {
        for (const child of node.children || []) {
          await executeNode(child, context, emitTask, errors)
          if (child.status === 'failed') break // Stop on failure
        }
        node.status = (node.children || []).every(c => c.status === 'completed') ? 'completed' : 'failed'
        node.completedAt = Date.now()
        break
      }

      case 'parallel': {
        const children = node.children || []
        const promises = children.map(child =>
          executeNode(child, context, emitTask, errors)
            .catch(err => { errors.push(err.message); child.status = 'failed' })
        )
        await Promise.allSettled(promises)
        node.status = children.every(c => c.status === 'completed') ? 'completed' : 'failed'
        node.completedAt = Date.now()
        break
      }

      case 'condition': {
        if (!node.condition) {
          node.status = 'failed'
          errors.push(`Condition node "${node.label}" has no condition`)
          return
        }
        const branch = node.condition.evaluate(context)
        const target = branch ? node.thenBranch : node.elseBranch
        if (target) {
          await executeNode(target, context, emitTask, errors)
          node.status = target.status
        } else {
          node.status = 'completed' // No branch to execute, trivially done
        }
        node.completedAt = Date.now()
        break
      }
    }
  } catch (err) {
    node.status = 'failed'
    node.completedAt = Date.now()
    errors.push(err instanceof Error ? err.message : String(err))
  }
}

// ============================================
// Auto-decomposition (LLM-driven)
// ============================================

/**
 * Decompose a high-level goal into a workflow DAG.
 * This is a template — the actual decomposition is done by the orchestrator
 * using LLM calls. This function provides the structural skeleton.
 */
export interface DecompositionHint {
  label: string
  type: WorkflowNode['type']
  children?: DecompositionHint[]
  taskType?: TaskType
  taskInput?: Partial<TaskInput>
}

export function buildWorkflowFromHints(
  name: string,
  description: string,
  hints: DecompositionHint,
): WorkflowDefinition {
  function build(hint: DecompositionHint): WorkflowNode {
    if (hint.type === 'task') {
      return createNode(hint.label, 'task', {
        taskType: hint.taskType,
        taskInput: hint.taskInput,
      })
    }
    if (hint.type === 'parallel' || hint.type === 'sequential') {
      return createNode(hint.label, hint.type, {
        children: (hint.children || []).map(build),
      })
    }
    // condition not used in auto-decomp currently
    return createNode(hint.label, 'task')
  }

  const root = build(hints)
  return createWorkflow(name, description, root)
}

// ============================================
// Helpers
// ============================================

/** Count total task nodes in a workflow. */
export function countTaskNodes(node: WorkflowNode): number {
  if (node.type === 'task') return 1
  if (node.type === 'condition') {
    let count = 0
    if (node.thenBranch) count += countTaskNodes(node.thenBranch)
    if (node.elseBranch) count += countTaskNodes(node.elseBranch)
    return count
  }
  let count = 0
  for (const child of node.children || []) {
    count += countTaskNodes(child)
  }
  return count
}

/** Get all task nodes as a flat list (BFS). */
export function flattenTaskNodes(root: WorkflowNode): WorkflowNode[] {
  const result: WorkflowNode[] = []
  const queue: WorkflowNode[] = [root]

  while (queue.length > 0) {
    const node = queue.shift()!
    if (node.type === 'task') {
      result.push(node)
    } else if (node.type === 'condition') {
      if (node.thenBranch) queue.push(node.thenBranch)
      if (node.elseBranch) queue.push(node.elseBranch)
    } else {
      queue.push(...(node.children || []))
    }
  }

  return result
}
