/**
 * EvolutionAgent — self-analysis and strategy improvement.
 *
 * Pipeline:
 * 1. Sample recent responses (prioritize corrected/questioned ones)
 * 2. Score on 4 dimensions: accuracy, completeness, conciseness, acceptance
 * 3. Diagnose patterns from low-score responses
 * 4. Generate/update evolution strategies
 * 5. Apply active strategies to system prompt
 * 6. Verify: monitor post-strategy quality, adjust weights
 */

import { getDb, type EvolutionLogRow, type EvolutionStrategyRow } from '../../db'
import { getNodeCount } from './knowledge-graph'
import { retrieve } from './retrieval'
import { callLLM } from '../llm-client'

const EVOLUTION_CYCLE_MESSAGES = 10 // run analysis every N conversation turns
const SAMPLE_SIZE = 5 // how many responses to analyze per cycle

// ============================================
// Main cycle
// ============================================

export async function runEvolutionCycle(): Promise<number> {
  const db = getDb()

  // Check if enough new data since last cycle
  const lastLog = db.prepare(
    "SELECT created_at FROM evolution_logs WHERE analysis_type = 'response_review' ORDER BY created_at DESC LIMIT 1"
  ).get() as { created_at: string } | undefined

  if (lastLog) {
    const hoursSince = (Date.now() - new Date(lastLog.created_at).getTime()) / 3600000
    if (hoursSince < 1) return 0 // At most once per hour
  }

  console.log('[EvolutionAgent] Starting analysis cycle')

  // 1. Sample: collect recent messages + corrections
  const samples = sampleRecentResponses(db)
  if (samples.length === 0) return 0

  // 2. Score responses
  const scored = await scoreResponses(samples)
  if (scored.length === 0) return 0

  // 3. Diagnose patterns from low-scoring responses
  const diagnoses = await diagnosePatterns(scored)

  // 4. Generate or update strategies
  let strategiesGenerated = 0
  for (const diag of diagnoses) {
    const existing = db.prepare(
      "SELECT id FROM evolution_strategies WHERE name = ?"
    ).get(diag.name) as { id: string } | undefined

    if (existing) {
      // Update existing strategy
      db.prepare(`
        UPDATE evolution_strategies
        SET weight = MIN(1.0, weight + 0.1),
            evidence_count = evidence_count + 1,
            last_applied_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), existing.id)
    } else {
      // Create new strategy
      db.prepare(`
        INSERT INTO evolution_strategies (id, name, rule, condition, weight, evidence_count, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(
        crypto.randomUUID(),
        diag.name,
        diag.rule,
        diag.condition ?? null,
        diag.weight ?? 0.6,
        new Date().toISOString()
      )
      strategiesGenerated++
    }

    // Log the finding
    db.prepare(`
      INSERT INTO evolution_logs (id, analysis_type, trigger, finding, severity, action, created_at)
      VALUES (?, 'response_review', 'periodic_analysis', ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      diag.finding,
      diag.severity ?? 'medium',
      diag.action,
      new Date().toISOString()
    )
  }

  console.log(`[EvolutionAgent] Generated ${strategiesGenerated} new strategies`)
  return strategiesGenerated
}

// ============================================
// Sampling
// ============================================

interface ResponseSample {
  question: string
  response: string
  wasFollowedUp: boolean
  wasCorrected: boolean
  timestamp: string
}

function sampleRecentResponses(db: ReturnType<typeof getDb>): ResponseSample[] {
  // Get recent AI messages with their preceding user message
  const messages = db.prepare(`
    SELECT m1.content as question, m2.content as response, m1.created_at
    FROM messages m1
    JOIN messages m2 ON m1.session_id = m2.session_id
      AND m2.role = 'assistant'
      AND m2.created_at > m1.created_at
    WHERE m1.role = 'user'
    ORDER BY m1.created_at DESC
    LIMIT 20
  `).all() as { question: string; response: string; created_at: string }[]

  if (messages.length === 0) return []

  // Prioritize: pick corrections from evolution_logs first
  const corrections = db.prepare(`
    SELECT finding FROM evolution_logs
    WHERE analysis_type = 'response_review' AND trigger = 'user_correction'
    ORDER BY created_at DESC LIMIT 5
  `).all() as { finding: string }[]

  const samples: ResponseSample[] = []

  // Add correction samples
  for (const c of corrections) {
    const parts = c.finding.split('Correction:')
    if (parts.length === 2) {
      samples.push({
        question: '',
        response: parts[0].replace('Original:', '').trim().slice(0, 300),
        wasFollowedUp: true,
        wasCorrected: true,
        timestamp: new Date().toISOString(),
      })
    }
  }

  // Add regular samples
  const regularSample = messages.slice(0, SAMPLE_SIZE - samples.length)
  for (const m of regularSample) {
    samples.push({
      question: m.question.slice(0, 300),
      response: m.response.slice(0, 500),
      wasFollowedUp: false,
      wasCorrected: false,
      timestamp: m.created_at,
    })
  }

  return samples.slice(0, SAMPLE_SIZE)
}

// ============================================
// Scoring
// ============================================

interface ScoredResponse extends ResponseSample {
  accuracy: number
  completeness: number
  conciseness: number
  acceptance: number
  overall: number
  issues: string[]
}

async function scoreResponses(samples: ResponseSample[]): Promise<ScoredResponse[]> {
  if (!apiKey || samples.length === 0) return []

  const samplesText = samples.map((s, i) =>
    `[${i + 1}]
Question: ${s.question || '(user correction)'}
Response: ${s.response.slice(0, 400)}
Was corrected: ${s.wasCorrected}`
  ).join('\n\n')

  const prompt = `Evaluate these AI responses. For each, score (0.0-1.0): accuracy, completeness, conciseness, acceptance.
Also list any issues found.

Return ONLY a JSON array:
[{
  "index": 1,
  "accuracy": 0.8,
  "completeness": 0.7,
  "conciseness": 0.9,
  "acceptance": 0.6,
  "overall": 0.75,
  "issues": ["issue1", "issue2"]
}]

Responses:
${samplesText}

JSON:`

  try {
    const response = await callLLM({
      systemPrompt: 'You are a quality analysis AI. Return only valid JSON arrays.',
      userPrompt: prompt,
      maxTokens: 2000,
      temperature: 0.1,
    })
    const parsed = parseScoreResponse(response, samples)
    return parsed
  } catch {
    return []
  }
}

function parseScoreResponse(response: string, samples: ResponseSample[]): ScoredResponse[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const scores = JSON.parse(jsonMatch[0])
    if (!Array.isArray(scores)) return []

    return scores.map((s: Record<string, unknown>, i: number) => ({
      ...(samples[i] || samples[0]),
      accuracy: clampScore(s.accuracy),
      completeness: clampScore(s.completeness),
      conciseness: clampScore(s.conciseness),
      acceptance: clampScore(s.acceptance),
      overall: clampScore(s.overall),
      issues: Array.isArray(s.issues) ? s.issues.map(String) : [],
    }))
  } catch {
    return []
  }
}

function clampScore(value: unknown): number {
  if (typeof value !== 'number') return 0.5
  return Math.max(0, Math.min(1, value))
}

// ============================================
// Pattern diagnosis
// ============================================

interface Diagnosis {
  name: string
  rule: string
  condition?: string
  finding: string
  severity: string
  action: string
  weight?: number
}

async function diagnosePatterns(scored: ScoredResponse[]): Promise<Diagnosis[]> {
  const lowScored = scored.filter(s => s.overall < 0.6)
  if (lowScored.length === 0) return []

  const lowText = lowScored.map((s, i) =>
    `[${i + 1}] Issues: ${s.issues.join(', ')}. Response: ${s.response.slice(0, 200)}`
  ).join('\n\n')

  const prompt = `These AI responses scored poorly. Diagnose patterns and suggest specific improvement strategies.

Return ONLY a JSON array:
[{
  "name": "strategy-name",
  "rule": "what the AI should do differently",
  "condition": "when to apply this rule (or null if always)",
  "finding": "what pattern was found",
  "severity": "low|medium|high|critical",
  "action": "specific action to take"
}]

Low-scoring responses:
${lowText}

JSON:`

  try {
    const response = await callLLM({
      systemPrompt: 'You are a quality analysis AI. Return only valid JSON arrays.',
      userPrompt: prompt,
      maxTokens: 2000,
      temperature: 0.1,
    })
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed.map((d: Record<string, unknown>) => ({
      name: String(d.name || 'unnamed-strategy'),
      rule: String(d.rule || ''),
      condition: d.condition ? String(d.condition) : undefined,
      finding: String(d.finding || ''),
      severity: String(d.severity || 'medium'),
      action: String(d.action || ''),
      weight: 0.6,
    }))
  } catch {
    return []
  }
}

// ============================================
// Strategy application
// ============================================

/**
 * Get active strategies to inject into the system prompt.
 * Returns "" if no strategies are active.
 */
export function getActiveStrategiesContext(): string {
  const db = getDb()
  const strategies = db.prepare(
    "SELECT * FROM evolution_strategies WHERE weight > 0.3 ORDER BY weight DESC LIMIT 5"
  ).all() as EvolutionStrategyRow[]

  if (strategies.length === 0) return ''

  const lines = strategies.map(s =>
    `- [${s.name}] ${s.rule} (confidence: ${s.weight.toFixed(2)})`
  )

  return `\n## Active improvement strategies\n${lines.join('\n')}`
}

/**
 * Mark a strategy as applied (bump its last_applied_at).
 */
export function markStrategiesApplied(strategyIds: string[]): void {
  const db = getDb()
  const now = new Date().toISOString()
  for (const id of strategyIds) {
    db.prepare('UPDATE evolution_strategies SET last_applied_at = ? WHERE id = ?')
      .run(now, id)
  }
}

/**
 * Verify a strategy: adjust weight based on outcome.
 * Positive outcome (user accepted response) → increase weight
 * Negative outcome (user corrected/followed up) → decrease weight
 */
export function verifyStrategy(
  strategyName: string,
  wasPositive: boolean
): void {
  const db = getDb()
  const strategy = db.prepare(
    "SELECT * FROM evolution_strategies WHERE name = ?"
  ).get(strategyName) as EvolutionStrategyRow | undefined

  if (!strategy) return

  const adjustment = wasPositive ? 0.05 : -0.15
  const newWeight = Math.max(0.1, Math.min(1.0, strategy.weight + adjustment))

  db.prepare('UPDATE evolution_strategies SET weight = ?, evidence_count = evidence_count + 1 WHERE id = ?')
    .run(newWeight, strategy.id)

  // Delete if weight drops too low
  if (newWeight <= 0.15) {
    db.prepare('DELETE FROM evolution_strategies WHERE id = ?').run(strategy.id)
    console.log(`[EvolutionAgent] Removed low-weight strategy: ${strategyName}`)
  }
}

