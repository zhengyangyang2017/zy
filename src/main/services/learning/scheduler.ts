/**
 * Background task scheduler for periodic research and evolution tasks.
 *
 * Manages a priority queue of learning_tasks, processes them
 * one at a time to avoid API rate limiting.
 */

import { getDb, type LearningTaskRow } from '../../db'
import { researchTopic } from './research-agent'
import { applyDecayToAll, getLowConfidenceNodes, deleteNode } from './knowledge-graph'
import { runEvolutionCycle } from './evolution-agent'
import { logger } from '../logger'

let schedulerInterval: ReturnType<typeof setInterval> | null = null
let evolutionInterval: ReturnType<typeof setInterval> | null = null
let isProcessing = false

const POLL_INTERVAL_MS = 5 * 60 * 1000 // Check queue every 5 minutes
const PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000 // Prune low-quality nodes every 6 hours
const EVOLUTION_INTERVAL_MS = 60 * 60 * 1000 // Run evolution analysis every hour

let lastPruneTime = Date.now()

/**
 * Start the background scheduler.
 * Polls for pending tasks and processes them.
 */
export function startScheduler(): void {
  if (schedulerInterval) return

  logger.info('Scheduler', 'Starting background scheduler')

  schedulerInterval = setInterval(async () => {
    if (isProcessing) return
    isProcessing = true

    try {
      await processNextTask()
      await periodicPrune()
    } catch (err) {
      logger.error('Scheduler', 'Error:', err)
    } finally {
      isProcessing = false
    }
  }, POLL_INTERVAL_MS)

  // Run immediately on start for pending tasks
  setTimeout(() => {
    if (!isProcessing) {
      isProcessing = true
      processNextTask().catch(err => logger.error('Scheduler', 'Initial run error:', err))
        .finally(() => { isProcessing = false })
    }
  }, 10000)

  // Evolution cycle: run every hour independently
  evolutionInterval = setInterval(async () => {
    try {
      const count = await runEvolutionCycle()
      if (count > 0) logger.info('Scheduler', `Evolution cycle generated ${count} strategies`)
    } catch (err) {
      logger.error('Scheduler', 'Evolution cycle error:', err)
    }
  }, EVOLUTION_INTERVAL_MS)
}

/**
 * Stop the background scheduler.
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }
  if (evolutionInterval) {
    clearInterval(evolutionInterval)
    evolutionInterval = null
  }
  logger.debug('Scheduler', 'Stopped')
}

/**
 * Get the next pending task by priority and process it.
 */
async function processNextTask(): Promise<void> {
  const db = getDb()

  // Also check for due scheduled tasks
  const now = new Date().toISOString()

  // Get highest priority pending task or due scheduled task
  const task = db.prepare(`
    SELECT * FROM learning_tasks
    WHERE status = 'pending'
      AND (schedule IS NULL OR schedule <= ?)
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
  `).get(now) as LearningTaskRow | undefined

  if (!task) return

  // Mark as researching
  db.prepare("UPDATE learning_tasks SET status = 'researching', started_at = ? WHERE id = ?")
    .run(now, task.id)

  logger.debug('Scheduler', `Processing task: "${task.topic}" priority=${task.priority}`)

  try {
    await researchTopic(task.topic, task.depth, task.max_sources)
  } catch (err) {
    logger.error('Scheduler', `Task failed: "${task.topic}"`, err)
    db.prepare("UPDATE learning_tasks SET status = 'failed', completed_at = ? WHERE id = ?")
      .run(now, task.id)
  }
}

/**
 * Periodically prune low-quality nodes and apply memory decay.
 */
async function periodicPrune(): Promise<void> {
  const now = Date.now()
  if (now - lastPruneTime < PRUNE_INTERVAL_MS) return
  lastPruneTime = now

  logger.debug('Scheduler', 'Running periodic prune')

  try {
    // Apply memory decay to all nodes
    applyDecayToAll()

    // Delete very low confidence nodes that haven't been accessed recently
    const staleNodes = getLowConfidenceNodes(0.3)
    let pruned = 0
    for (const node of staleNodes) {
      if (node.last_accessed_at) {
        const daysSinceAccess = (now - new Date(node.last_accessed_at).getTime()) / 86400000
        if (daysSinceAccess > 7) {
          deleteNode(node.id)
          pruned++
        }
      }
    }
    if (pruned > 0) logger.info('Scheduler', `Pruned ${pruned} stale nodes`)
  } catch (err) {
    logger.error('Scheduler', 'Prune error:', err)
  }
}

/**
 * Manually enqueue a research task.
 */
export function enqueueTask(
  topic: string,
  priority: number = 0.5,
  depth: number = 2,
  maxSources: number = 5,
  schedule?: string
): string {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO learning_tasks (id, topic, priority, status, depth, max_sources, schedule, created_at)
    VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(id, topic, priority, depth, maxSources, schedule ?? null, now)

  return id
}

/**
 * Get all pending/completed tasks.
 */
export function getTasks(): LearningTaskRow[] {
  const db = getDb()
  return db.prepare(
    "SELECT * FROM learning_tasks ORDER BY priority DESC, created_at DESC"
  ).all() as LearningTaskRow[]
}