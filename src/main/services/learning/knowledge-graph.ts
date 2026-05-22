/**
 * Knowledge Graph CRUD operations.
 *
 * Core module for managing nodes, edges, vectors, memory strength,
 * reachability, and corroborations in SQLite.
 */

import { uuid } from './uuid'
import { getDb, type KnowledgeNodeRow, type KnowledgeEdgeRow } from '../../db'
import { encodeVector, decodeVector, cosineSimilarity } from './embeddings'
import { computeLSHKeys, LSHIndex } from './lsh'

// ============================================
// LSH index (in-memory, rebuilt on restart)
// ============================================
const lshIndex = new LSHIndex()

function rebuildLSHIndex(): void {
  lshIndex.clear()
  const db = getDb()
  const nodes = db.prepare('SELECT id, title, summary, content FROM knowledge_nodes').all() as KnowledgeNodeRow[]
  for (const node of nodes) {
    const text = `${node.title} ${node.summary ?? ''} ${node.content}`
    const keys = computeLSHKeys(text)
    lshIndex.add(node.id, keys)
  }
}

// Build LSH index on first access
let lshReady = false
function ensureLSH(): void {
  if (!lshReady) {
    rebuildLSHIndex()
    lshReady = true
  }
}

// ============================================
// Node CRUD
// ============================================

export interface CreateNodeInput {
  type: string
  title: string
  content: string
  summary?: string
  tags?: string[]
  source: string
  sourceUrl?: string
  confidence?: number
  importance?: number
  expiresAt?: string
}

export function createNode(input: CreateNodeInput, vector?: Float32Array): string {
  const db = getDb()
  const id = uuid()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO knowledge_nodes (id, type, title, content, summary, tags, source, source_url, confidence, importance, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.type,
    input.title,
    input.content,
    input.summary ?? null,
    input.tags ? JSON.stringify(input.tags) : null,
    input.source,
    input.sourceUrl ?? null,
    input.confidence ?? 0.5,
    input.importance ?? 0.3,
    now,
    now
  )

  // Insert vector if provided
  if (vector) {
    db.prepare(`
      INSERT INTO knowledge_vectors (node_id, vector, model, dimension, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, encodeVector(vector), 'all-MiniLM-L6-v2', vector.length, now)
  }

  // Insert memory strength
  db.prepare(`
    INSERT INTO knowledge_memory_strength (node_id, strength, last_reinforced_at)
    VALUES (?, 1.0, ?)
  `).run(id, now)

  // Sync FTS
  const nodeRow = db.prepare('SELECT rowid FROM knowledge_nodes WHERE id = ?').get(id) as { rowid: number }
  db.prepare(`INSERT INTO knowledge_fts(rowid, title, summary, content) VALUES (?, ?, ?, ?)`)
    .run(nodeRow.rowid, input.title, input.summary ?? '', input.content)

  // Add to LSH index
  const text = `${input.title} ${input.summary ?? ''} ${input.content}`
  lshIndex.add(id, computeLSHKeys(text))

  return id
}

export function getNode(id: string): KnowledgeNodeRow | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM knowledge_nodes WHERE id = ?').get(id) as KnowledgeNodeRow | undefined
}

export function updateNode(id: string, updates: Partial<CreateNodeInput>): void {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  if (updates.type !== undefined) { fields.push('type = ?'); values.push(updates.type) }
  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title) }
  if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content) }
  if (updates.summary !== undefined) { fields.push('summary = ?'); values.push(updates.summary) }
  if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)) }
  if (updates.confidence !== undefined) { fields.push('confidence = ?'); values.push(updates.confidence) }
  if (updates.importance !== undefined) { fields.push('importance = ?'); values.push(updates.importance) }
  if (updates.expiresAt !== undefined) { fields.push('expires_at = ?'); values.push(updates.expiresAt) }

  fields.push('updated_at = ?')
  values.push(new Date().toISOString())

  values.push(id)
  db.prepare(`UPDATE knowledge_nodes SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  // Update FTS
  const node = getNode(id)
  if (node) {
    const row = db.prepare('SELECT rowid FROM knowledge_nodes WHERE id = ?').get(id) as { rowid: number }
    db.prepare(`UPDATE knowledge_fts SET title = ?, summary = ?, content = ? WHERE rowid = ?`)
      .run(node.title, node.summary ?? '', node.content, row.rowid)
  }
}

export function bumpAccessCount(id: string): void {
  const db = getDb()
  db.prepare(`
    UPDATE knowledge_nodes
    SET access_count = access_count + 1,
        last_accessed_at = ?,
        importance = MIN(1.0, importance + 0.01)
    WHERE id = ?
  `).run(new Date().toISOString(), id)
}

export function deleteNode(id: string): void {
  const db = getDb()
  const node = getNode(id)
  if (node) {
    const text = `${node.title} ${node.summary ?? ''} ${node.content}`
    lshIndex.remove(id, computeLSHKeys(text))
  }
  db.prepare('DELETE FROM knowledge_nodes WHERE id = ?').run(id)
}

// ============================================
// Vector operations
// ============================================

export function getNodeVector(nodeId: string): Float32Array | undefined {
  const db = getDb()
  const row = db.prepare('SELECT vector FROM knowledge_vectors WHERE node_id = ?').get(nodeId) as { vector: Buffer } | undefined
  if (!row) return undefined
  return decodeVector(row.vector)
}

export function getAllVectors(): Map<string, Float32Array> {
  const db = getDb()
  const rows = db.prepare('SELECT node_id, vector FROM knowledge_vectors').all() as { node_id: string; vector: Buffer }[]
  const map = new Map<string, Float32Array>()
  for (const row of rows) {
    map.set(row.node_id, decodeVector(row.vector))
  }
  return map
}

// ============================================
// Edge CRUD
// ============================================

export interface CreateEdgeInput {
  sourceId: string
  targetId: string
  relationType: string
  weight?: number
  evidence?: string
  inferred?: boolean
}

export function createEdge(input: CreateEdgeInput): string {
  const db = getDb()
  const id = uuid()

  db.prepare(`
    INSERT INTO knowledge_edges (id, source_id, target_id, relation_type, weight, evidence, inferred, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.sourceId,
    input.targetId,
    input.relationType,
    input.weight ?? 0.5,
    input.evidence ?? null,
    input.inferred ? 1 : 0,
    new Date().toISOString()
  )

  // Invalidate reachability cache for affected nodes
  invalidateReachability(input.sourceId)
  invalidateReachability(input.targetId)

  return id
}

export function getEdgesFrom(nodeId: string): KnowledgeEdgeRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM knowledge_edges WHERE source_id = ?').all(nodeId) as KnowledgeEdgeRow[]
}

export function getEdgesTo(nodeId: string): KnowledgeEdgeRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM knowledge_edges WHERE target_id = ?').all(nodeId) as KnowledgeEdgeRow[]
}

export function getEdgesBetween(nodeA: string, nodeB: string): KnowledgeEdgeRow[] {
  const db = getDb()
  return db.prepare(`
    SELECT * FROM knowledge_edges
    WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)
  `).all(nodeA, nodeB, nodeB, nodeA) as KnowledgeEdgeRow[]
}

// ============================================
// Transitive closure / reachability (lazy)
// ============================================

const reachabilityCache = new Map<string, { nodes: string[]; hops: number }[]>()

function reachCacheKey(nodeId: string): string {
  return `reach:${nodeId}`
}

function invalidateReachability(nodeId: string): void {
  reachabilityCache.delete(reachCacheKey(nodeId))
}

/**
 * Get all nodes reachable from `nodeId` within `maxHops`.
 * Results are cached until edges change.
 */
export function getReachableNodes(nodeId: string, maxHops: number = 3): { nodeId: string; hops: number; path: string[] }[] {
  const key = `${reachCacheKey(nodeId)}:${maxHops}`
  const db = getDb()

  // BFS from scratch
  const visited = new Map<string, { hops: number; path: string[] }>()
  const queue: { id: string; hops: number; path: string[] }[] = [{ id: nodeId, hops: 0, path: [nodeId] }]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.hops >= maxHops) continue

    const edges = getEdgesFrom(current.id)
    for (const edge of edges) {
      if (visited.has(edge.target_id)) continue
      const newPath = [...current.path, edge.target_id]
      visited.set(edge.target_id, { hops: current.hops + 1, path: newPath })
      queue.push({ id: edge.target_id, hops: current.hops + 1, path: newPath })
    }
  }

  return Array.from(visited.entries()).map(([nodeId, info]) => ({
    nodeId,
    hops: info.hops,
    path: info.path
  }))
}

// ============================================
// Memory strength
// ============================================

export function reinforceMemory(nodeId: string): void {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE knowledge_memory_strength
    SET strength = MIN(1.0, strength + 0.1),
        last_reinforced_at = ?,
        reinforcement_count = reinforcement_count + 1
    WHERE node_id = ?
  `).run(now, nodeId)
}

export function applyDecay(nodeId: string): void {
  const db = getDb()
  const row = db.prepare('SELECT strength, half_life_hours, last_reinforced_at FROM knowledge_memory_strength WHERE node_id = ?')
    .get(nodeId) as { strength: number; half_life_hours: number; last_reinforced_at: string } | undefined
  if (!row) return

  const hoursSince = (Date.now() - new Date(row.last_reinforced_at).getTime()) / 3600000
  const decayFactor = Math.exp(-Math.log(2) * hoursSince / row.half_life_hours)
  const newStrength = row.strength * decayFactor

  if (newStrength < 0.05) {
    // Too weak — remove the node
    deleteNode(nodeId)
  } else {
    db.prepare('UPDATE knowledge_memory_strength SET strength = ? WHERE node_id = ?')
      .run(newStrength, nodeId)
    // Also lower importance
    db.prepare('UPDATE knowledge_nodes SET importance = MAX(0.1, importance * ?) WHERE id = ?')
      .run(decayFactor, nodeId)
  }
}

export function applyDecayToAll(): void {
  const db = getDb()
  const rows = db.prepare('SELECT node_id FROM knowledge_memory_strength').all() as { node_id: string }[]
  for (const row of rows) {
    applyDecay(row.node_id)
  }
}

// ============================================
// Corroboration
// ============================================

export function recordCorroboration(
  nodeAId: string,
  nodeBId: string,
  similarity: number,
  relation: string
): void {
  const db = getDb()
  db.prepare(`
    INSERT INTO knowledge_corroborations (id, node_a_id, node_b_id, similarity, relation, detected_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuid(), nodeAId, nodeBId, similarity, relation, new Date().toISOString())

  // If two sources support the same fact, boost confidence
  if (relation === 'supports' || relation === 'duplicate') {
    db.prepare('UPDATE knowledge_nodes SET confidence = MIN(1.0, confidence + 0.1) WHERE id = ?').run(nodeAId)
    db.prepare('UPDATE knowledge_nodes SET confidence = MIN(1.0, confidence + 0.1) WHERE id = ?').run(nodeBId)
  }
  // If contradictory, lower confidence of both
  if (relation === 'contradicts') {
    db.prepare('UPDATE knowledge_nodes SET confidence = MAX(0.1, confidence - 0.2) WHERE id = ?').run(nodeAId)
    db.prepare('UPDATE knowledge_nodes SET confidence = MAX(0.1, confidence - 0.2) WHERE id = ?').run(nodeBId)
  }
}

// ============================================
// LSH candidate lookup
// ============================================

export function getLSHCandidates(text: string): Set<string> {
  ensureLSH()
  return lshIndex.query(computeLSHKeys(text))
}

// ============================================
// Query helpers
// ============================================

export function getNodeCount(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as count FROM knowledge_nodes').get() as { count: number }
  return row.count
}

export function getEdgeCount(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as count FROM knowledge_edges').get() as { count: number }
  return row.count
}

export function getNodeByTitle(title: string): KnowledgeNodeRow | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM knowledge_nodes WHERE title = ?').get(title) as KnowledgeNodeRow | undefined
}

export function getAllNodeIds(): string[] {
  const db = getDb()
  const rows = db.prepare('SELECT id FROM knowledge_nodes').all() as { id: string }[]
  return rows.map(r => r.id)
}

export function getExpiredNodes(): KnowledgeNodeRow[] {
  const db = getDb()
  return db.prepare("SELECT * FROM knowledge_nodes WHERE expires_at IS NOT NULL AND expires_at < ?")
    .all(new Date().toISOString()) as KnowledgeNodeRow[]
}

export function getLowConfidenceNodes(threshold: number): KnowledgeNodeRow[] {
  const db = getDb()
  return db.prepare('SELECT * FROM knowledge_nodes WHERE confidence < ?').all(threshold) as KnowledgeNodeRow[]
}

export { uuid } from './uuid'
