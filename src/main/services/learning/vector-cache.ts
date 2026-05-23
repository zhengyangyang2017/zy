/**
 * In-memory vector cache — avoids O(n) SQLite scan per query.
 *
 * Vectors are loaded once at startup and kept in a Map.
 * Refresh is triggered when new nodes are added.
 */

import { getDb } from '../../db'
import { cosineSimilarity, activeEmbeddingModel } from './embeddings'

interface CachedVector {
  nodeId: string
  vector: Float32Array
  importance: number
  confidence: number
}

let vectorCache: CachedVector[] | null = null
let nodeIdSet: Set<string> = new Set()
let dirty = true

/** Load all vectors into memory. Called on first query or when dirty. */
function ensureLoaded(): void {
  if (vectorCache && !dirty) return

  const db = getDb()
  // Only load vectors from the current active embedding model to avoid cross-model semantic mismatch
  const currentModel = activeEmbeddingModel
  const rows = db.prepare(`
    SELECT kv.node_id, kv.vector, kv.model, kn.importance, kn.confidence
    FROM knowledge_vectors kv
    JOIN knowledge_nodes kn ON kn.id = kv.node_id
    WHERE (kn.expires_at IS NULL OR kn.expires_at > ?)
  `).all(new Date().toISOString()) as {
    node_id: string
    vector: Buffer
    model: string
    importance: number
    confidence: number
  }[]

  vectorCache = rows
    .filter(r => r.model === currentModel || r.model === 'unknown')
    .map(r => ({
      nodeId: r.node_id,
      vector: new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4),
      importance: r.importance ?? 0.3,
      confidence: r.confidence ?? 0.5,
    }))

  nodeIdSet = new Set(vectorCache.map(v => v.nodeId))
  dirty = false
}

/** Mark cache as needing refresh (call after inserting new nodes). */
export function invalidateVectorCache(): void {
  dirty = true
}

/** Check if a node ID is in the cache. */
export function hasVector(nodeId: string): boolean {
  ensureLoaded()
  return nodeIdSet.has(nodeId)
}

/** Get cached vector count. */
export function getCachedVectorCount(): number {
  ensureLoaded()
  return vectorCache?.length ?? 0
}

/**
 * Pre-filtered similarity search — only computes cosine on candidates
 * that pass the importance/confidence threshold.
 *
 * @param queryVector - the embedded query vector
 * @param candidates - Set of node IDs to restrict search (empty = all)
 * @param limit - max results
 * @param minScore - minimum similarity threshold (0-1)
 * @param minImportance - skip nodes with importance below this
 */
export function cachedSimilaritySearch(
  queryVector: Float32Array,
  candidates: Set<string>,
  limit: number,
  minScore: number = 0.2,
  minImportance: number = 0,
): { nodeId: string; score: number }[] {
  ensureLoaded()
  if (!vectorCache || vectorCache.length === 0) return []

  const results: { nodeId: string; score: number }[] = []

  // Batch processing for memory efficiency
  const BATCH_SIZE = 200
  for (let i = 0; i < vectorCache.length; i += BATCH_SIZE) {
    const batch = vectorCache.slice(i, i + BATCH_SIZE)
    for (const entry of batch) {
      // LSH pre-filter
      if (candidates.size > 0 && !candidates.has(entry.nodeId)) continue
      // Importance pre-filter (fast skip)
      if (entry.importance < minImportance) continue

      const similarity = cosineSimilarity(queryVector, entry.vector)
      if (similarity >= minScore) {
        results.push({ nodeId: entry.nodeId, score: similarity })
      }
    }
  }

  // Sort by score descending, take top
  results.sort((a, b) => b.score - a.score)
  return results.slice(0, limit)
}

/**
 * Get vector by node ID from cache.
 */
export function getCachedVector(nodeId: string): Float32Array | undefined {
  ensureLoaded()
  return vectorCache?.find(v => v.nodeId === nodeId)?.vector
}
