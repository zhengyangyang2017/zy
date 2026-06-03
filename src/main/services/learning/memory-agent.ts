/**
 * MemoryAgent — extracts knowledge from conversations.
 *
 * Pipeline:
 * 1. Format conversation into extraction prompt
 * 2. Call LLM to extract structured facts/preferences/concepts
 * 3. Dedup via LSH + vector similarity
 * 4. Embed + create knowledge nodes
 * 5. Build edges between new and existing nodes
 * 6. Reinforce existing nodes that were referenced
 */

import { getDb } from '../../db'
import { createNode, createEdge, getNode, getLSHCandidates, reinforceMemory, applyDecayToAll, getAllVectors } from './knowledge-graph'
import { embed, cosineSimilarity } from './embeddings'
import { getNodeVector } from './knowledge-graph'
import { computeLSHKeys, estimateJaccard } from './lsh'
import { callLLM } from '../llm-client'

// ============================================
// Main extraction
// ============================================

interface ExtractedItem {
  type: 'fact' | 'concept' | 'preference' | 'insight'
  title: string
  content: string
  tags?: string[]
  importance?: number
}

interface MessageBufferEntry {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export async function extractKnowledge(
  sessionId: string,
  messages: MessageBufferEntry[]
): Promise<number> {
  if (messages.length === 0) return 0

  try {
    // 1. Format prompt and call LLM
    const prompt = buildExtractionPrompt(messages)
    const rawResponse = await callLLM({
      systemPrompt: 'You are a knowledge extraction AI. Return only valid JSON arrays.',
      userPrompt: prompt,
      maxTokens: 2000,
      temperature: 0.1,
    })
    const items = parseExtractionResponse(rawResponse)

    if (items.length === 0) return 0

    // 2. Process each item
    let created = 0
    const newNodeIds: string[] = []
    for (const item of items) {
      try {
        // Dedup check
        if (await isDuplicate(item.title, item.content)) {
          continue
        }

        // Generate embedding
        const text = `${item.title}\n${item.content}`
        const vector = await embed(text)

        // Create node
        const nodeId = createNode({
          type: item.type,
          title: item.title,
          content: item.content,
          summary: item.content.slice(0, 200),
          tags: item.tags,
          source: 'conversation',
          importance: item.importance ?? 0.4,
          confidence: 0.6,
        }, vector)

        newNodeIds.push(nodeId)
        created++
      } catch (err) {
        console.warn(`[MemoryAgent] Failed to create node for "${item.title}":`, err)
      }
    }

    // 3. Build edges between new nodes and existing related ones
    if (newNodeIds.length > 0) {
      await buildEdgesForNewNodes(newNodeIds)
    }

    // 4. Periodic decay
    if (Math.random() < 0.1) {
      applyDecayToAll()
    }

    console.log(`[MemoryAgent] Extracted ${created} knowledge nodes from session ${sessionId}`)
    return created
  } catch (err) {
    console.error('[MemoryAgent] Extraction failed:', err)
    return 0
  }
}

// ============================================
// Prompt construction
// ============================================

function buildExtractionPrompt(messages: MessageBufferEntry[]): string {
  const conversation = messages
    .map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content.slice(0, 500)}`)
    .join('\n\n')

  return `Analyze this conversation and extract key knowledge as JSON. Return ONLY a JSON array, no other text.

For each item, include:
- type: "fact" | "concept" | "preference" | "insight"
- title: short title (max 80 chars)
- content: detailed description (max 300 chars)
- tags: array of 1-3 keywords
- importance: 0.0-1.0 (how important to remember)

Focus on:
- Technical facts and decisions
- User preferences and conventions
- New concepts explained
- Project-specific patterns
- Corrections and lessons learned

Conversation:
${conversation}

JSON:`
}

function parseExtractionResponse(response: string): ExtractedItem[] {
  try {
    // Try to extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed.map((item: Record<string, unknown>) => ({
      type: (item.type as ExtractedItem['type']) || 'fact',
      title: String(item.title || '').slice(0, 80),
      content: String(item.content || '').slice(0, 500),
      tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 3) : undefined,
      importance: typeof item.importance === 'number' ? Math.max(0, Math.min(1, item.importance)) : 0.4,
    }))
  } catch {
    return []
  }
}

// ============================================
// Dedup
// ============================================

async function isDuplicate(title: string, content: string): Promise<boolean> {
  const text = `${title} ${content}`
  const keys = computeLSHKeys(text)

  // Check LSH candidates
  const candidates = getLSHCandidates(text)
  if (candidates.size === 0) return false

  // Vector check for candidates with score > 0.85
  const queryVec = await embed(text)
  for (const candidateId of candidates) {
    const existingVec = getNodeVector(candidateId)
    if (existingVec) {
      const sim = cosineSimilarity(queryVec, existingVec)
      if (sim > 0.85) return true
    }
  }

  return false
}

// ============================================
// Edge building
// ============================================

async function buildEdgesForNewNodes(newNodeIds: string[]): Promise<void> {
  const MIN_SIMILARITY = 0.5
  const MAX_EDGES_PER_NODE = 5

  // Get all existing vectors (includes the new nodes)
  const allVectors = getAllVectors()
  if (allVectors.size === 0) return

  for (const newNodeId of newNodeIds) {
    const newVec = getNodeVector(newNodeId)
    if (!newVec) continue

    // Find top-K similar existing nodes (excluding self and other new nodes)
    const scored: { id: string; score: number }[] = []
    const newSet = new Set(newNodeIds)

    for (const [existingId, existingVec] of allVectors) {
      if (existingId === newNodeId || newSet.has(existingId)) continue
      const sim = cosineSimilarity(newVec, existingVec)
      if (sim >= MIN_SIMILARITY) {
        scored.push({ id: existingId, score: sim })
      }
    }

    // Keep top K edges
    scored.sort((a, b) => b.score - a.score)
    for (const { id: targetId, score } of scored.slice(0, MAX_EDGES_PER_NODE)) {
      try {
        createEdge({
          sourceId: newNodeId,
          targetId,
          relationType: 'related_to',
          weight: Math.min(1, score),
          inferred: true,
        })
      } catch {
        // edge may already exist (unique constraint), skip
      }
    }
  }
}

function getNodeByTitle(title: string): { id: string } | undefined {
  const db = getDb()
  return db.prepare('SELECT id FROM knowledge_nodes WHERE title = ?').get(title) as { id: string } | undefined
}

