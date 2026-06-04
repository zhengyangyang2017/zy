import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'claude-code-gui.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initTables()
  }
  return db
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

    CREATE TABLE IF NOT EXISTS message_feedback (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      rating TEXT NOT NULL CHECK(rating IN ('up', 'down')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_message ON message_feedback(message_id);

    -- ============================================
    -- Knowledge Graph Tables
    -- ============================================

    CREATE TABLE IF NOT EXISTS knowledge_nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      tags TEXT,
      source TEXT NOT NULL,
      source_url TEXT,
      confidence REAL DEFAULT 0.5,
      importance REAL DEFAULT 0.3,
      access_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_accessed_at TEXT,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS knowledge_vectors (
      node_id TEXT PRIMARY KEY REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      vector BLOB NOT NULL,
      model TEXT NOT NULL,
      dimension INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_edges (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL,
      weight REAL DEFAULT 0.5,
      evidence TEXT,
      inferred INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_edges_source ON knowledge_edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_edges_target ON knowledge_edges(target_id);

    CREATE TABLE IF NOT EXISTS knowledge_reachability (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      hops INTEGER NOT NULL,
      path TEXT NOT NULL,
      total_weight REAL NOT NULL,
      PRIMARY KEY (source_id, target_id, hops)
    );

    CREATE TABLE IF NOT EXISTS knowledge_sources (
      id TEXT PRIMARY KEY,
      node_id TEXT NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_detail TEXT,
      credibility REAL DEFAULT 0.5,
      extracted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_corroborations (
      id TEXT PRIMARY KEY,
      node_a_id TEXT NOT NULL,
      node_b_id TEXT NOT NULL,
      similarity REAL NOT NULL,
      relation TEXT NOT NULL,
      detected_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge_memory_strength (
      node_id TEXT PRIMARY KEY REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
      strength REAL DEFAULT 1.0,
      last_reinforced_at TEXT NOT NULL,
      decay_rate REAL DEFAULT 0.01,
      half_life_hours REAL DEFAULT 168,
      reinforcement_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS learning_tasks (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      question TEXT,
      priority REAL DEFAULT 0.5,
      status TEXT DEFAULT 'pending',
      depth INTEGER DEFAULT 2,
      max_sources INTEGER DEFAULT 5,
      schedule TEXT,
      parent_task_id TEXT,
      knowledge_gap_id TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS evolution_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      analysis_type TEXT NOT NULL,
      trigger TEXT,
      finding TEXT NOT NULL,
      severity TEXT DEFAULT 'medium',
      action TEXT,
      action_result TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evolution_strategies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rule TEXT NOT NULL,
      condition TEXT,
      weight REAL DEFAULT 1.0,
      evidence_count INTEGER DEFAULT 1,
      last_applied_at TEXT,
      created_at TEXT NOT NULL
    );
  `)

  // Add parent_session_id and branch_point to sessions (safe migration)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN parent_session_id TEXT`)
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN branch_point TEXT`)
  } catch { /* column already exists */ }

  // Add pinned and tags to sessions (safe migration)
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0`)
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT ''`)
  } catch { /* column already exists */ }

  // FTS5 virtual table: created separately (can't use IF NOT EXISTS in exec with virtual tables)
  ensureFtsTable()
}

function ensureFtsTable() {
  const exists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_fts'"
  ).get()
  if (!exists) {
    db.exec(`
      CREATE VIRTUAL TABLE knowledge_fts USING fts5(
        title, summary, content,
        content='knowledge_nodes',
        content_rowid='rowid'
      );
    `)
  }
}

// ============================================
// Interfaces
// ============================================

export interface SessionRow {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
  status: string
  parent_session_id?: string | null
  branch_point?: string | null
  pinned?: number | null
  tags?: string | null
}

export interface MessageRow {
  id: string
  session_id: string
  role: string
  content: string
  created_at: string
}

export interface KnowledgeNodeRow {
  id: string
  type: string
  title: string
  content: string
  summary: string | null
  tags: string | null
  source: string
  source_url: string | null
  confidence: number
  importance: number
  access_count: number
  created_at: string
  updated_at: string
  last_accessed_at: string | null
  expires_at: string | null
}

export interface KnowledgeEdgeRow {
  id: string
  source_id: string
  target_id: string
  relation_type: string
  weight: number
  evidence: string | null
  inferred: number
  created_at: string
}

export interface KnowledgeVectorRow {
  node_id: string
  vector: Buffer
  model: string
  dimension: number
  created_at: string
}

export interface LearningTaskRow {
  id: string
  topic: string
  question: string | null
  priority: number
  status: string
  depth: number
  max_sources: number
  schedule: string | null
  parent_task_id: string | null
  knowledge_gap_id: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface EvolutionLogRow {
  id: string
  session_id: string | null
  analysis_type: string
  trigger: string | null
  finding: string
  severity: string
  action: string | null
  action_result: string | null
  created_at: string
}

export interface EvolutionStrategyRow {
  id: string
  name: string
  rule: string
  condition: string | null
  weight: number
  evidence_count: number
  last_applied_at: string | null
  created_at: string
}
