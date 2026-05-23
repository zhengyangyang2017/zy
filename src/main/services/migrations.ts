/**
 * Database migration system — versioned, idempotent schema upgrades.
 *
 * Migrations are numbered sequentially. Each migration runs in a transaction.
 * The current version is stored in a `schema_version` table.
 * On startup, all pending migrations are applied in order.
 *
 * To add a migration: push to the MIGRATIONS array below.
 */

import type Database from 'better-sqlite3'
import { logger } from './logger'

interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      // Base tables are created in db.ts initTables()
      // This ensures schema_version table exists
    },
  },
  {
    version: 2,
    name: 'add_cluster_tables',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cluster_idempotency (
          key TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          result_json TEXT,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON cluster_idempotency(expires_at);

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

        CREATE TABLE IF NOT EXISTS cluster_workflow_state (
          workflow_id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'running',
          nodes_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          completed_at TEXT
        );
      `)
    },
  },
  {
    version: 3,
    name: 'add_crash_logs',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS crash_logs (
          id TEXT PRIMARY KEY,
          error_type TEXT NOT NULL,
          error_message TEXT NOT NULL,
          stack_trace TEXT,
          context TEXT,
          app_version TEXT,
          os_info TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_crash_created ON crash_logs(created_at);
      `)
    },
  },
  {
    version: 4,
    name: 'add_diagnostics_table',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS diagnostics (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          metric TEXT NOT NULL,
          value REAL,
          detail TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_diag_category ON diagnostics(category);
        CREATE INDEX IF NOT EXISTS idx_diag_created ON diagnostics(created_at);
      `)
    },
  },
  {
    version: 5,
    name: 'add_indices_performance',
    up: (db) => {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_content ON messages(content);
        CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
        CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_type ON knowledge_nodes(type);
        CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_importance ON knowledge_nodes(importance);
      `)
    },
  },
]

export function getCurrentVersion(db: Database.Database): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)
  const row = db.prepare(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  ).get() as { version: number } | undefined
  return row?.version ?? 0
}

export function runMigrations(db: Database.Database): number {
  const current = getCurrentVersion(db)
  const pending = MIGRATIONS.filter(m => m.version > current)

  if (pending.length === 0) return current

  logger.info('Migrations', `Running ${pending.length} pending migrations (current v${current})`)

  for (const migration of pending) {
    const startMs = Date.now()
    try {
      db.transaction(() => {
        migration.up(db)
        db.prepare(
          'INSERT INTO schema_version (version, applied_at) VALUES (?, ?)'
        ).run(migration.version, new Date().toISOString())
      })()
      logger.info('Migrations', `v${migration.version}: ${migration.name} (${Date.now() - startMs}ms)`)
    } catch (err) {
      logger.error('Migrations', `v${migration.version} FAILED: ${err}`)
      throw err
    }
  }

  return getCurrentVersion(db)
}
