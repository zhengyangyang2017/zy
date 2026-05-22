/**
 * LearningOrchestrator — central coordinator for all three learning agents.
 *
 * Responsibilities:
 * - Buffer conversation messages, trigger MemoryAgent when threshold reached
 * - Inject relevant knowledge into chat context before each AI call
 * - Detect knowledge gaps, trigger ResearchAgent
 * - Detect user corrections, trigger EvolutionAgent
 * - Manage background scheduled tasks
 */

import { extractKnowledge } from './memory-agent'
import { retrieveLayered } from './retrieval'
import { getNodeCount, getEdgeCount } from './knowledge-graph'
import { getDb } from '../../db'
import { enqueueTask } from './scheduler'
import { researchTopic } from './research-agent'
import { getActiveStrategiesContext } from './evolution-agent'

const BUFFER_THRESHOLD = 10 // trigger memory extraction every N messages
const MAX_CONTEXT_TOKENS = 2000 // rough character limit for injected context

interface MessageBufferEntry {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const sessionBuffer = new Map<string, MessageBufferEntry[]>()
const processingSessions = new Set<string>()

/**
 * Called after each conversation turn (user message + AI response).
 * Buffers messages and triggers memory extraction when threshold met.
 */
export async function onConversationTurn(
  sessionId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  const buffer = sessionBuffer.get(sessionId) || []
  const now = new Date().toISOString()

  buffer.push({ role: 'user', content: userMessage, timestamp: now })
  buffer.push({ role: 'assistant', content: assistantResponse, timestamp: now })
  sessionBuffer.set(sessionId, buffer)

  // Trigger extraction if threshold met and not already processing
  if (buffer.length >= BUFFER_THRESHOLD && !processingSessions.has(sessionId)) {
    processingSessions.add(sessionId)
    try {
      const messagesForExtraction = buffer.splice(0, buffer.length)
      sessionBuffer.set(sessionId, buffer)
      await extractKnowledge(sessionId, messagesForExtraction)
    } finally {
      processingSessions.delete(sessionId)
    }
  }
}

/**
 * Called when a session is closed or deleted.
 * Extracts remaining knowledge from the buffer regardless of threshold.
 */
export async function onSessionEnd(sessionId: string): Promise<void> {
  const buffer = sessionBuffer.get(sessionId)
  if (buffer && buffer.length > 0) {
    await extractKnowledge(sessionId, buffer)
  }
  sessionBuffer.delete(sessionId)
}

/**
 * Get knowledge-augmented context for a user query.
 * Returns text to inject into the system prompt.
 */
export async function getContextAugmentation(query: string): Promise<string> {
  const nodeCount = getNodeCount()
  if (nodeCount === 0) return ''

  try {
    const { summaries, details } = await retrieveLayered(query, 5)

    if (summaries.length === 0 && details.length === 0) return ''

    const parts: string[] = []

    if (summaries.length > 0) {
      parts.push('## Relevant knowledge (concepts)')
      for (const s of summaries) {
        parts.push(`- **${s.node.title}**: ${s.node.summary || s.node.content.slice(0, 200)}`)
      }
    }

    if (details.length > 0) {
      parts.push('\n## Relevant knowledge (details)')
      for (const d of details.slice(0, 8)) {
        parts.push(`- **${d.node.title}**: ${d.node.summary || d.node.content.slice(0, 150)}`)
      }
    }

    // Add active evolution strategies
    const strategies = getActiveStrategiesContext()
    if (strategies) {
      parts.push(strategies)
    }

    const context = parts.join('\n')

    // Truncate if too long
    if (context.length > MAX_CONTEXT_TOKENS) {
      return context.slice(0, MAX_CONTEXT_TOKENS) + '\n... (truncated)'
    }

    return context
  } catch {
    return ''
  }
}

/**
 * Called when the user corrects the AI.
 * High-priority immediate trigger for EvolutionAgent.
 */
export async function onUserCorrection(
  sessionId: string,
  originalResponse: string,
  correction: string
): Promise<void> {
  const db = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO evolution_logs (id, session_id, analysis_type, trigger, finding, severity, created_at)
    VALUES (?, ?, 'response_review', 'user_correction', ?, 'high', ?)
  `).run(id, sessionId, `Original: "${originalResponse.slice(0, 300)}"\nCorrection: "${correction.slice(0, 300)}"`, now)

  console.log(`[Orchestrator] User correction logged for session ${sessionId}`)
}

/**
 * Get knowledge base statistics.
 */
export function getKnowledgeStats() {
  return {
    nodeCount: getNodeCount(),
    edgeCount: getEdgeCount(),
  }
}

/**
 * Start a research task immediately (from user command).
 */
export async function startResearch(topic: string, depth: number = 2): Promise<string> {
  const taskId = enqueueTask(topic, 0.9, depth)
  // Also execute immediately
  researchTopic(topic, depth).catch(err =>
    console.error(`[Orchestrator] Research failed for "${topic}":`, err)
  )
  return taskId
}

/**
 * Detect knowledge gaps and auto-enqueue research.
 * Called when retrieval returns no results for a substantive query.
 */
export function detectKnowledgeGap(query: string): void {
  // Only auto-research if query looks substantive (> 20 chars, contains technical terms)
  if (query.length < 20) return

  const technicalPatterns = [
    /what is/i, /how (to|does|do)/i, /explain/i,
    /react/i, /vue/i, /electron/i, /typescript/i, /javascript/i,
    /api/i, /database/i, /node/i, /python/i, /rust/i, /go/i,
    /component/i, /function/i, /class/i, /module/i,
    /错误/i, /怎么/i, /什么是/i, /如何/i,
  ]

  const isSubstantive = technicalPatterns.some(p => p.test(query))
  if (!isSubstantive) return

  // Enqueue low-priority background research
  enqueueTask(query.slice(0, 100), 0.3, 1, 3)
  console.log(`[Orchestrator] Auto-enqueued research for gap: "${query.slice(0, 80)}"`)
}

/**
 * Flush all buffers (useful for testing or app shutdown).
 */
export function flushAll(): void {
  sessionBuffer.clear()
  processingSessions.clear()
}
