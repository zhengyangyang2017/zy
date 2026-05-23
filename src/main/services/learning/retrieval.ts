/**
 * Hybrid retrieval: FTS5 keyword + vector semantic search.
 *
 * Two-pass retrieval:
 * 1. FTS5 BM25 + vector cosine similarity, scores fused via weighted average
 * 2. Layered: summary nodes first, then expand to leaf nodes
 *
 * Query cache avoids recomputation for near-identical queries.
 */

import { getDb, type KnowledgeNodeRow } from '../../db'
import { embed, embedCache, cosineSimilarity, getEmbeddingDimension } from './embeddings'
import { getLSHCandidates } from './knowledge-graph'
import { cachedSimilaritySearch, invalidateVectorCache } from './vector-cache'

const FTS_WEIGHT = 0.3
const VECTOR_WEIGHT = 0.7
const DEFAULT_TOP_K = 10
const QUERY_CACHE_SIMILARITY = 0.95

interface ScoredNode {
  node: KnowledgeNodeRow
  score: number
  ftsScore: number
  vectorScore: number
}

interface CachedQuery {
  query: string
  queryVector: Float32Array
  results: ScoredNode[]
  timestamp: number
}

const queryCache: CachedQuery[] = []
const MAX_CACHE_SIZE = 50

// ============================================
// Main retrieval
// ============================================

export async function retrieve(
  query: string,
  topK: number = DEFAULT_TOP_K
): Promise<ScoredNode[]> {
  // Check cache
  const cached = checkCache(query)
  if (cached) return cached.slice(0, topK)

  const db = getDb()

  // 1. FTS5 keyword search
  const ftsResults = ftsSearch(db, query, topK * 3)

  // 2. Vector semantic search
  const queryVector = await embed(query)
  const vectorResults = await vectorSearch(db, queryVector, query, topK * 3)

  // 3. Merge and fuse scores
  const merged = mergeResults(ftsResults, vectorResults, topK)

  // 4. Cache the result
  cacheQuery(query, queryVector, merged)

  return merged
}

/**
 * Layered retrieval: first find matching summary/concept nodes,
 * then expand to their leaf nodes via edges.
 */
export async function retrieveLayered(
  query: string,
  topK: number = DEFAULT_TOP_K
): Promise<{ summaries: ScoredNode[]; details: ScoredNode[] }> {
  const direct = await retrieve(query, topK)

  // Find summary/concept nodes among results
  const summaries = direct.filter(r =>
    r.node.type === 'concept' || r.node.type === 'insight'
  ).slice(0, 3)

  if (summaries.length === 0) {
    return { summaries: direct.slice(0, 3), details: direct.slice(3) }
  }

  // Expand: get nodes connected to top summaries
  const detailIds = new Set<string>()
  for (const s of summaries) {
    const edges = getDb().prepare(
      'SELECT target_id FROM knowledge_edges WHERE source_id = ?'
    ).all(s.node.id) as { target_id: string }[]
    for (const e of edges) {
      if (!direct.find(r => r.node.id === e.target_id)) {
        detailIds.add(e.target_id)
      }
    }
  }

  // Fetch detail nodes
  const details: ScoredNode[] = []
  for (const id of detailIds) {
    const node = getDb().prepare('SELECT * FROM knowledge_nodes WHERE id = ?').get(id) as KnowledgeNodeRow | undefined
    if (node) {
      details.push({ node, score: 0.5, ftsScore: 0, vectorScore: 0.5 })
    }
  }

  // Sort direct results: non-summary nodes become "details"
  const nonSummaries = direct.filter(r =>
    r.node.type !== 'concept' && r.node.type !== 'insight'
  )

  return {
    summaries,
    details: [...nonSummaries, ...details].slice(0, topK * 2)
  }
}

// ============================================
// FTS5 keyword search
// ============================================

function ftsSearch(db: ReturnType<typeof getDb>, query: string, limit: number): Map<string, number> {
  const results = new Map<string, number>()

  // Sanitize query for FTS5: escape special chars, wrap in quotes for phrase search
  const sanitized = query.replace(/[^\w\s一-鿿]/g, ' ').trim()
  if (!sanitized) return results

  try {
    const rows = db.prepare(`
      SELECT rowid, rank FROM knowledge_fts WHERE knowledge_fts MATCH ? ORDER BY rank LIMIT ?
    `).all(sanitized.split(/\s+/).map(w => `"${w}"`).join(' OR '), limit) as { rowid: number; rank: number }[]

    for (const row of rows) {
      const nodeRow = db.prepare('SELECT id FROM knowledge_nodes WHERE rowid = ?').get(row.rowid) as { id: string }
      // BM25 rank is negative; normalize to 0-1 via 1/(1+abs(rank))
      const score = 1 / (1 + Math.abs(row.rank))
      results.set(nodeRow.id, score)
    }
  } catch {
    // FTS5 match failed — empty results
  }

  return results
}

// ============================================
// Vector semantic search
// ============================================

async function vectorSearch(
  _db: ReturnType<typeof getDb>,
  queryVector: Float32Array,
  queryText: string,
  limit: number
): Promise<Map<string, number>> {
  const results = new Map<string, number>()

  // LSH pre-filter for fast candidate narrowing
  const candidates = getLSHCandidates(queryText)

  // Use in-memory cached vectors instead of full table scan
  // Falls back to full scan only when cache is cold (first query)
  const scored = cachedSimilaritySearch(
    queryVector,
    candidates,
    limit,
    0.15,   // min similarity threshold
    0.05,   // min importance (skip completely irrelevant nodes)
  )

  for (const s of scored) {
    results.set(s.nodeId, s.score)
  }

  return results
}

// ============================================
// Score fusion
// ============================================

function mergeResults(
  ftsResults: Map<string, number>,
  vectorResults: Map<string, number>,
  topK: number
): ScoredNode[] {
  const db = getDb()
  const allIds = new Set([...ftsResults.keys(), ...vectorResults.keys()])
  const scored: ScoredNode[] = []

  for (const id of allIds) {
    const ftsScore = ftsResults.get(id) ?? 0
    const vectorScore = vectorResults.get(id) ?? 0
    const fusedScore = FTS_WEIGHT * ftsScore + VECTOR_WEIGHT * vectorScore

    const node = db.prepare('SELECT * FROM knowledge_nodes WHERE id = ?').get(id) as KnowledgeNodeRow | undefined
    if (!node) continue

    // Boost by importance and confidence
    const boostedScore = fusedScore * (0.5 + 0.5 * node.importance) * (0.3 + 0.7 * node.confidence)

    scored.push({ node, score: boostedScore, ftsScore, vectorScore })
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  // Bump access count for top results
  for (const s of scored.slice(0, topK)) {
    db.prepare('UPDATE knowledge_nodes SET access_count = access_count + 1, last_accessed_at = ? WHERE id = ?')
      .run(new Date().toISOString(), s.node.id)
  }

  return scored.slice(0, topK)
}

// ============================================
// Query cache
// ============================================

function checkCache(query: string): ScoredNode[] | null {
  const queryVector = embedCache.get(query)
  if (!queryVector) return null

  for (const entry of queryCache) {
    const sim = cosineSimilarity(queryVector, entry.queryVector)
    if (sim >= QUERY_CACHE_SIMILARITY) {
      // Update timestamp to keep fresh
      entry.timestamp = Date.now()
      return entry.results
    }
  }
  return null
}

function cacheQuery(query: string, queryVector: Float32Array, results: ScoredNode[]): void {
  queryCache.push({ query, queryVector, results, timestamp: Date.now() })
  if (queryCache.length > MAX_CACHE_SIZE) {
    // Evict oldest
    queryCache.sort((a, b) => a.timestamp - b.timestamp)
    queryCache.splice(0, Math.floor(MAX_CACHE_SIZE * 0.3))
  }
}

export function clearQueryCache(): void {
  queryCache.length = 0
}
