/**
 * Shared State Store — persistent cluster state with idempotency.
 *
 * Extends the existing SQLite knowledge graph with:
 * - Idempotency keys (dedup via content hash)
 * - Agent heartbeat records
 * - Task state persistence
 * - Workflow state
 *
 * Uses WAL mode for concurrent read/write.
 */

import { getDb, type SessionRow, type MessageRow } from '../../db'

// Simple hash function (FNV-1a, fast and collision-resistant enough for idempotency)
function hashKey(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

// ============================================
// Idempotency
// ============================================

export interface IdempotencyRecord {
  key: string
  task_id: string
  result_json: string | null
  created_at: string
  expires_at: string
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function ensureIdempotencyTable(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_idempotency (
      key TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      result_json TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON cluster_idempotency(expires_at);
  `)
}

export function checkIdempotency(input: string): { processed: boolean; taskId?: string; result?: Record<string, unknown> } {
  ensureIdempotencyTable()
  const db = getDb()
  const key = hashKey(input)

  // Clean expired records occasionally
  if (Math.random() < 0.05) {
    db.prepare("DELETE FROM cluster_idempotency WHERE expires_at < ?")
      .run(new Date().toISOString())
  }

  const record = db.prepare("SELECT * FROM cluster_idempotency WHERE key = ? AND expires_at > ?")
    .get(key, new Date().toISOString()) as IdempotencyRecord | undefined

  if (record) {
    return {
      processed: true,
      taskId: record.task_id,
      result: record.result_json ? JSON.parse(record.result_json) : undefined,
    }
  }

  return { processed: false }
}

export function recordIdempotency(input: string, taskId: string, result?: Record<string, unknown>): void {
  ensureIdempotencyTable()
  const db = getDb()
  const key = hashKey(input)
  const now = new Date()
  const expires = new Date(now.getTime() + IDEMPOTENCY_TTL_MS)

  db.prepare(`
    INSERT OR REPLACE INTO cluster_idempotency (key, task_id, result_json, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(key, taskId, result ? JSON.stringify(result) : null, now.toISOString(), expires.toISOString())
}

// ============================================
// Agent state
// ============================================

export interface AgentStateRow {
  agent_id: string
  status: string
  current_task: string | null
  tasks_completed: number
  tasks_failed: number
  avg_task_ms: number
  last_heartbeat: string
  role: string
}

function ensureAgentStateTable(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_agent_state (
      agent_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      current_task TEXT,
      tasks_completed INTEGER DEFAULT 0,
      tasks_failed INTEGER DEFAULT 0,
      avg_task_ms REAL DEFAULT 0,
      last_heartbeat TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'general'
    );
  `)
}

export function upsertAgentState(state: AgentStateRow): void {
  ensureAgentStateTable()
  const db = getDb()
  db.prepare(`
    INSERT INTO cluster_agent_state (agent_id, status, current_task, tasks_completed, tasks_failed, avg_task_ms, last_heartbeat, role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET
      status = excluded.status,
      current_task = excluded.current_task,
      tasks_completed = excluded.tasks_completed,
      tasks_failed = excluded.tasks_failed,
      avg_task_ms = excluded.avg_task_ms,
      last_heartbeat = excluded.last_heartbeat,
      role = excluded.role
  `).run(state.agent_id, state.status, state.current_task, state.tasks_completed, state.tasks_failed, state.avg_task_ms, state.last_heartbeat, state.role)
}

export function getAgentStates(): AgentStateRow[] {
  ensureAgentStateTable()
  const db = getDb()
  return db.prepare("SELECT * FROM cluster_agent_state ORDER BY agent_id").all() as AgentStateRow[]
}

export function getDeadAgents(timeoutMs: number): AgentStateRow[] {
  ensureAgentStateTable()
  const db = getDb()
  const cutoff = new Date(Date.now() - timeoutMs).toISOString()
  return db.prepare(
    "SELECT * FROM cluster_agent_state WHERE last_heartbeat < ? AND status != 'dead'"
  ).all(cutoff) as AgentStateRow[]
}

// ============================================
// Task state
// ============================================

export interface TaskStateRow {
  task_id: string
  type: string
  priority: number
  status: string
  agent_id: string | null
  workflow_id: string | null
  input_json: string
  result_json: string | null
  error: string | null
  retry_count: number
  created_at: string
  started_at: string | null
  completed_at: string | null
}

function ensureTaskStateTable(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_task_state (
      task_id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      priority REAL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'pending',
      agent_id TEXT,
      workflow_id TEXT,
      input_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT,
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_task_status ON cluster_task_state(status);
    CREATE INDEX IF NOT EXISTS idx_task_workflow ON cluster_task_state(workflow_id);
  `)
}

export function persistTask(task: {
  id: string; type: string; priority: number; status: string;
  agentId?: string | null; workflowId?: string | null;
  input: Record<string, unknown>; result?: Record<string, unknown> | null;
  error?: string | null; retryCount?: number;
  createdAt: number; startedAt?: number | null; completedAt?: number | null;
}): void {
  ensureTaskStateTable()
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO cluster_task_state (task_id, type, priority, status, agent_id, workflow_id, input_json, result_json, error, retry_count, created_at, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id, task.type, task.priority, task.status,
    task.agentId ?? null, task.workflowId ?? null,
    JSON.stringify(task.input),
    task.result ? JSON.stringify(task.result) : null,
    task.error ?? null, task.retryCount ?? 0,
    new Date(task.createdAt).toISOString(),
    task.startedAt ? new Date(task.startedAt).toISOString() : null,
    task.completedAt ? new Date(task.completedAt).toISOString() : null,
  )
}

export function getTasksByWorkflow(workflowId: string): TaskStateRow[] {
  ensureTaskStateTable()
  const db = getDb()
  return db.prepare(
    "SELECT * FROM cluster_task_state WHERE workflow_id = ? ORDER BY created_at"
  ).all(workflowId) as TaskStateRow[]
}

export function getTasksByStatus(status: string): TaskStateRow[] {
  ensureTaskStateTable()
  const db = getDb()
  return db.prepare(
    "SELECT * FROM cluster_task_state WHERE status = ? ORDER BY created_at DESC LIMIT 100"
  ).all(status) as TaskStateRow[]
}

// ============================================
// Workflow state
// ============================================

export interface WorkflowStateRow {
  workflow_id: string
  name: string
  status: string
  nodes_json: string
  created_at: string
  completed_at: string | null
}

function ensureWorkflowStateTable(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_workflow_state (
      workflow_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      nodes_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
  `)
}

export function persistWorkflowState(workflow: {
  workflowId: string; name: string; status: string;
  nodes: Record<string, unknown>; completedAt?: number | null;
}): void {
  ensureWorkflowStateTable()
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO cluster_workflow_state (workflow_id, name, status, nodes_json, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    workflow.workflowId, workflow.name, workflow.status,
    JSON.stringify(workflow.nodes),
    new Date().toISOString(),
    workflow.completedAt ? new Date(workflow.completedAt).toISOString() : null,
  )
}

export function getWorkflowStates(): WorkflowStateRow[] {
  ensureWorkflowStateTable()
  const db = getDb()
  return db.prepare(
    "SELECT * FROM cluster_workflow_state ORDER BY created_at DESC LIMIT 50"
  ).all() as WorkflowStateRow[]
}

// ============================================
// Initialization
// ============================================

let initialized = false

export function initClusterStateStore(): void {
  if (initialized) return
  ensureIdempotencyTable()
  ensureAgentStateTable()
  ensureTaskStateTable()
  ensureWorkflowStateTable()
  initialized = true
}
