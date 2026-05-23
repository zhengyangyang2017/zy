/**
 * Crash Reporter — captures unhandled errors, writes structured crash logs.
 *
 * Features:
 * - Global uncaughtException / unhandledRejection handlers
 * - Structured crash log storage in SQLite
 * - Diagnostic snapshot collection on crash
 * - Recovery suggestion on next startup
 */

import { app } from 'electron'
import { getDb } from '../db'
import { loadConfig } from './config'
import { logger } from './logger'
import { release, cpus, totalmem } from 'os'
import { uuid } from './learning/uuid'

let crashCount = 0
const MAX_CRASHES_BEFORE_SAFE_MODE = 5
const CRASH_WINDOW_MS = 60 * 1000 // 1 minute
let crashWindow: number[] = []

export interface CrashReport {
  id: string
  error_type: string
  error_message: string
  stack_trace: string | null
  context: string | null
  app_version: string | null
  os_info: string | null
  created_at: string
}

function getOsInfo(): string {
  try {
    return `${process.platform} ${process.arch} | ${release()} | ${cpus().length} CPUs | ${Math.round(totalmem() / 1024 / 1024 / 1024)}GB RAM`
  } catch {
    return `${process.platform} ${process.arch}`
  }
}

export function initCrashReporter(): void {
  const appVersion = app?.getVersion?.() || '0.2.0-beta'

  // Uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    crashCount++
    crashWindow.push(Date.now())
    // Trim old entries
    const cutoff = Date.now() - CRASH_WINDOW_MS
    crashWindow = crashWindow.filter(t => t > cutoff)

    logger.error('CrashReporter', `Uncaught exception: ${error.message}`)

    try {
      const db = getDb()
      db.prepare(`
        INSERT INTO crash_logs (id, error_type, error_message, stack_trace, context, app_version, os_info, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid(),
        error.name || 'Error',
        error.message.slice(0, 1000),
        error.stack?.slice(0, 5000) || null,
        'uncaughtException',
        appVersion,
        getOsInfo(),
        new Date().toISOString(),
      )
    } catch {
      // Last resort: can't even log to DB
      console.error('[FATAL]', error)
    }

    // If too many crashes, suggest safe mode
    if (crashWindow.length >= MAX_CRASHES_BEFORE_SAFE_MODE) {
      logger.error('CrashReporter', 'CRITICAL: Too many crashes in short window — suggest safe mode')
    }
  })

  // Unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    crashCount++
    crashWindow.push(Date.now())
    const cutoff = Date.now() - CRASH_WINDOW_MS
    crashWindow = crashWindow.filter(t => t > cutoff)

    const msg = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : null

    logger.error('CrashReporter', `Unhandled rejection: ${msg}`)

    try {
      const db = getDb()
      db.prepare(`
        INSERT INTO crash_logs (id, error_type, error_message, stack_trace, context, app_version, os_info, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuid(),
        'UnhandledRejection',
        msg.slice(0, 1000),
        stack?.slice(0, 5000) || null,
        'unhandledRejection',
        appVersion,
        getOsInfo(),
        new Date().toISOString(),
      )
    } catch {
      console.error('[FATAL REJECTION]', reason)
    }
  })

  logger.info('CrashReporter', 'Initialized')
}

/** Get recent crash reports. */
export function getCrashReports(limit: number = 20): CrashReport[] {
  try {
    const db = getDb()
    return db.prepare(
      'SELECT * FROM crash_logs ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as CrashReport[]
  } catch {
    return []
  }
}

/** Check if app should start in safe mode. */
export function shouldStartSafeMode(): boolean {
  if (crashWindow.length >= MAX_CRASHES_BEFORE_SAFE_MODE) return true

  // Check recent crash count from DB
  try {
    const db = getDb()
    const cutoff = new Date(Date.now() - CRASH_WINDOW_MS).toISOString()
    const row = db.prepare(
      "SELECT COUNT(*) as count FROM crash_logs WHERE created_at > ?"
    ).get(cutoff) as { count: number } | undefined
    return (row?.count ?? 0) >= MAX_CRASHES_BEFORE_SAFE_MODE
  } catch {
    return false
  }
}

/** Clear crash history. */
export function clearCrashReports(): void {
  try {
    getDb().exec('DELETE FROM crash_logs')
  } catch { /* best effort */ }
}
