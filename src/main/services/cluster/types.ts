/**
 * Agent Cluster — core type definitions.
 *
 * Architecture: DAG workflow + Pub/Sub events + shared state
 * 20 homogeneous agents, work-stealing queue, dynamic role switching
 */

// ============================================
// Agent
// ============================================

export type AgentId = string

export type AgentStatus = 'idle' | 'working' | 'error' | 'restarting' | 'dead'

export type AgentRole =
  | 'research'    // Web search + knowledge synthesis
  | 'code-gen'    // Generate code
  | 'code-review' // Review / critique code
  | 'memory'      // Extract knowledge from conversations
  | 'evolution'   // Self-improvement strategies
  | 'verify'      // Verify output quality
  | 'monitor'     // Watch file/git events
  | 'general'     // Catch-all for unknown task types

export interface AgentInfo {
  id: AgentId
  status: AgentStatus
  currentTask: string | null       // TaskId or null
  tasksCompleted: number
  tasksFailed: number
  avgTaskMs: number                // Rolling average task duration
  lastHeartbeat: number            // Date.now() timestamp
  uptime: number                   // ms since agent started
  role: AgentRole                  // Current active role
  roleHistory: { role: AgentRole; ts: number }[]
}

export interface AgentHeartbeat {
  agentId: AgentId
  status: AgentStatus
  currentTask: string | null
  queueDepth: number
  tasksCompleted: number
  tasksFailed: number
  avgTaskMs: number
  ts: number
}

// ============================================
// Task
// ============================================

export type TaskType =
  | 'research'       // Research a topic via web
  | 'code-gen'       // Generate code
  | 'code-review'    // Review existing code
  | 'memory-extract' // Extract knowledge from text
  | 'evolution'      // Run evolution analysis
  | 'verify'         // Verify output correctness
  | 'monitor-check'  // Periodic monitor scan
  | 'decompose'      // Decompose a goal into sub-tasks (orchestrator)
  | 'synthesize'     // Synthesize multiple results into one
  | 'custom'         // User-defined task

export type TaskPriority = number  // 0.0–1.0, higher = more urgent

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled'

export interface Task {
  id: string                       // Unique task ID (also idempotency key)
  type: TaskType
  priority: TaskPriority
  role: AgentRole                  // Which role handles this
  input: TaskInput
  parentWorkflowId: string | null  // Belongs to which workflow
  parentTaskId: string | null      // Parent task in workflow
  status: TaskStatus
  assignedAgent: AgentId | null
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  result: TaskResult | null
  error: string | null
  retryCount: number
  maxRetries: number
  timeout: number                  // ms, 0 = no timeout
  metadata: Record<string, unknown>
}

export interface TaskInput {
  query?: string                   // Natural language query
  context?: string                 // Additional context / code
  files?: string[]                 // File paths to include
  urls?: string[]                  // URLs for research
  maxTokens?: number               // Max tokens for response
  temperature?: number             // LLM temperature
  constraints?: string[]           // Rules / constraints
  expectedOutput?: string          // Description of expected output format
  previousResults?: TaskResult[]   // Results from upstream tasks
}

export interface TaskResult {
  taskId: string
  agentId: AgentId
  success: boolean
  output: string                   // Primary output text
  structuredOutput?: Record<string, unknown>
  citations?: { url: string; title: string; snippet: string }[]
  tokensUsed: number
  durationMs: number
  subTasks?: Task[]                // If this task spawned sub-tasks
  errors: string[]
  warnings: string[]
}

// ============================================
// Pub/Sub Events
// ============================================

export type TopicPattern = string  // e.g., "task:completed", "agent:*", "knowledge:*"

export interface ClusterEvent {
  id: string
  topic: TopicPattern
  payload: unknown
  source: AgentId | 'orchestrator' | 'system'
  ts: number
  correlationId?: string           // Tie related events together
}

export type EventHandler = (event: ClusterEvent) => void | Promise<void>

export interface Subscription {
  id: string
  pattern: TopicPattern            // Supports * wildcard
  handler: EventHandler
  createdAt: number
}

// ============================================
// Workflow DSL
// ============================================

export type WorkflowNodeType = 'parallel' | 'sequential' | 'condition' | 'task'

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  label: string
  // For 'task' type
  taskTemplate?: Partial<Task>
  // For 'parallel' / 'sequential' types
  children?: WorkflowNode[]
  // For 'condition' type
  condition?: WorkflowCondition
  thenBranch?: WorkflowNode
  elseBranch?: WorkflowNode
  // Execution state
  status?: TaskStatus
  startedAt?: number
  completedAt?: number
  result?: TaskResult
}

export interface WorkflowCondition {
  expression: string               // Human-readable condition description
  evaluate: (context: WorkflowContext) => boolean
}

export interface WorkflowContext {
  workflowId: string
  variables: Record<string, unknown>
  nodeResults: Map<string, TaskResult>
  startedAt: number
}

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  root: WorkflowNode
  createdAt: number
  createdBy: AgentId | 'user' | 'orchestrator'
}

// ============================================
// Queue
// ============================================

export interface QueueStats {
  totalPending: number
  totalRunning: number
  totalCompleted: number
  totalFailed: number
  avgWaitMs: number                // Average time in queue before pickup
  stealCount: number               // Total successful steals
  byType: Record<TaskType, number> // Pending count by type
  byPriority: { high: number; medium: number; low: number }
}

// ============================================
// Cluster
// ============================================

export interface ClusterConfig {
  agentCount: number               // Total agent pool size (default 20)
  heartbeatIntervalMs: number      // Agent heartbeat interval (default 5000)
  taskTimeoutMs: number            // Default task timeout (default 60000)
  maxRetries: number               // Max task retries (default 3)
  eventBufferSize: number          // Events to buffer per topic (default 100)
  idleTimeoutMs: number            // Shrink pool after this idle (0 = never)
  stateSyncIntervalMs: number      // State sync frequency (default 1000)
}

export interface ClusterState {
  config: ClusterConfig
  agents: Map<AgentId, AgentInfo>
  queueStats: QueueStats
  workflowCount: number
  activeWorkflows: string[]
  uptime: number
  totalTasksCompleted: number
  totalTasksFailed: number
  avgThroughput: number            // Tasks per minute
}

export const DEFAULT_CLUSTER_CONFIG: ClusterConfig = {
  agentCount: 20,
  heartbeatIntervalMs: 5000,
  taskTimeoutMs: 60000,
  maxRetries: 3,
  eventBufferSize: 100,
  idleTimeoutMs: 0,
  stateSyncIntervalMs: 1000,
}

// ============================================
// Idempotency
// ============================================

export interface IdempotencyRecord {
  key: string                      // Hash of task input
  taskId: string                   // Original task ID
  result: TaskResult | null
  createdAt: number
  expiresAt: number                // TTL for dedup window
}
