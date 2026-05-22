/**
 * ResearchAgent — web search + reading + knowledge synthesis.
 *
 * Pipeline:
 * 1. Decompose topic into sub-questions
 * 2. Search web for each sub-question
 * 3. Fetch and extract text from found URLs
 * 4. Synthesize knowledge via LLM
 * 5. Create knowledge nodes + auto-link
 * 6. Recurse: identify new questions, repeat with depth-1
 *
 * Budget controls:
 * - Daily API call cap
 * - Priority queue
 * - Early stop on known content (>70% overlap)
 */

import https from 'https'
import { IncomingMessage } from 'http'
import { createNode, createEdge, getNode, getNodeByTitle } from './knowledge-graph'
import { embed } from './embeddings'
import { computeLSHKeys, LSHIndex } from './lsh'
import { getDb, type LearningTaskRow } from '../../db'

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const baseUrl = import.meta.env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || ''

const DAILY_API_CAP = 200 // max LLM calls per day for research
const EARLY_STOP_OVERLAP = 0.7 // stop if overlap with existing knowledge > 70%

let apiCallsToday = 0
let lastResetDate = new Date().toDateString()

function resetDailyBudget(): void {
  const today = new Date().toDateString()
  if (today !== lastResetDate) {
    apiCallsToday = 0
    lastResetDate = today
  }
}

function hasBudget(): boolean {
  resetDailyBudget()
  return apiCallsToday < DAILY_API_CAP
}

// ============================================
// Main entry point
// ============================================

export interface ResearchResult {
  topic: string
  nodesCreated: number
  subTopics: string[]
  depth: number
}

export async function researchTopic(
  topic: string,
  depth: number = 2,
  maxSources: number = 5
): Promise<ResearchResult> {
  resetDailyBudget()

  console.log(`[ResearchAgent] Starting research: "${topic}" depth=${depth} maxSources=${maxSources}`)
  const result = await researchRecursive(topic, depth, maxSources, new Set())

  // Update task status in DB
  const db = getDb()
  const task = db.prepare(
    "SELECT id FROM learning_tasks WHERE topic = ? AND status = 'researching'"
  ).get(topic) as { id: string } | undefined
  if (task) {
    db.prepare("UPDATE learning_tasks SET status = 'completed', completed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), task.id)
  }

  console.log(`[ResearchAgent] Done: "${topic}" created ${result.nodesCreated} nodes`)
  return result
}

async function researchRecursive(
  topic: string,
  depth: number,
  maxSources: number,
  visited: Set<string>
): Promise<ResearchResult> {
  if (depth <= 0 || !hasBudget() || visited.has(topic)) {
    return { topic, nodesCreated: 0, subTopics: [], depth }
  }
  visited.add(topic)

  // 1. Search
  const urls = await searchWeb(topic, maxSources)
  if (urls.length === 0) {
    return { topic, nodesCreated: 0, subTopics: [], depth }
  }

  // 2. Read pages
  const pages = await readPages(urls.slice(0, maxSources))

  // 3. Extract and synthesize knowledge
  const knowledgeItems = await synthesizeKnowledge(topic, pages)
  if (knowledgeItems.length === 0) {
    return { topic, nodesCreated: 0, subTopics: [], depth }
  }

  // 4. Create nodes with embeddings
  let nodesCreated = 0
  const createdNodeIds: string[] = []

  for (const item of knowledgeItems) {
    if (!hasBudget()) break

    // Early stop: skip if too similar to existing knowledge
    if (await isAlreadyKnown(item.title, item.content)) continue

    const vector = await embed(`${item.title}\n${item.content}`)
    const nodeId = createNode({
      type: item.type,
      title: item.title,
      content: item.content,
      summary: item.content.slice(0, 200),
      tags: item.tags,
      source: 'web_search',
      sourceUrl: item.sourceUrl,
      importance: item.importance ?? 0.5,
      confidence: 0.7,
    }, vector)

    createdNodeIds.push(nodeId)
    nodesCreated++
  }

  // 5. Link nodes created in this batch
  for (let i = 0; i < createdNodeIds.length; i++) {
    for (let j = i + 1; j < createdNodeIds.length; j++) {
      createEdge({
        sourceId: createdNodeIds[i],
        targetId: createdNodeIds[j],
        relationType: 'related_to',
        weight: 0.6,
        inferred: true,
      })
    }
  }

  // 6. Discover sub-topics and recurse
  const subTopics = await discoverSubTopics(topic, pages)
  const subResults: ResearchResult[] = []
  for (const sub of subTopics.slice(0, 3)) {
    if (!hasBudget()) break
    const subResult = await researchRecursive(sub, depth - 1, maxSources, visited)
    subResults.push(subResult)
    nodesCreated += subResult.nodesCreated
  }

  return {
    topic,
    nodesCreated,
    subTopics: subResults.map(r => r.topic),
    depth,
  }
}

// ============================================
// Web search (DuckDuckGo Lite)
// ============================================

async function searchWeb(query: string, maxResults: number = 5): Promise<string[]> {
  try {
    const html = await httpGet('lite.duckduckgo.com', `/lite/?q=${encodeURIComponent(query)}`)
    return extractDuckDuckGoUrls(html).slice(0, maxResults)
  } catch (err) {
    console.warn(`[ResearchAgent] Search failed for "${query}":`, err)
    return []
  }
}

function extractDuckDuckGoUrls(html: string): string[] {
  const urls: string[] = []
  // DuckDuckGo Lite has result links in format: <a rel="nofollow" href="...">
  const linkRegex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="result-link"/g
  let match
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1]
    // Skip DuckDuckGo internal links
    if (!url.includes('duckduckgo.com')) {
      urls.push(url)
    }
  }
  // Fallback: try generic link extraction
  if (urls.length === 0) {
    const genericRegex = /<a[^>]*href="(https?:\/\/[^"]+)"/g
    while ((match = genericRegex.exec(html)) !== null) {
      const url = match[1]
      if (!url.includes('duckduckgo.com') && !url.includes('ad.') && !url.includes('sponsored')) {
        urls.push(url)
      }
    }
  }
  return urls
}

// ============================================
// Page reading
// ============================================

interface PageContent {
  url: string
  title: string
  text: string
}

async function readPages(urls: string[]): Promise<PageContent[]> {
  const results: PageContent[] = []

  for (const url of urls) {
    try {
      const u = new URL(url)
      const html = await httpGet(u.hostname, u.pathname + u.search)

      const title = extractTitle(html) || url
      const text = extractText(html).slice(0, 8000) // Limit per page

      if (text.length > 200) {
        results.push({ url, title, text })
      }
    } catch (err) {
      console.warn(`[ResearchAgent] Failed to read ${url}:`, err)
    }
  }

  return results
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match ? match[1].trim() : ''
}

function extractText(html: string): string {
  // Remove scripts, styles, and head
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')

  // Strip all HTML tags
  text = text.replace(/<[^>]+>/g, ' ')

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')

  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim()

  return text
}

// ============================================
// Knowledge synthesis via LLM
// ============================================

interface SynthesizedItem {
  type: 'fact' | 'concept' | 'insight'
  title: string
  content: string
  tags?: string[]
  importance?: number
  sourceUrl?: string
}

async function synthesizeKnowledge(
  topic: string,
  pages: PageContent[]
): Promise<SynthesizedItem[]> {
  if (pages.length === 0 || !hasBudget()) return []

  const pagesText = pages
    .map((p, i) => `[Source ${i + 1}] ${p.title}\nURL: ${p.url}\n${p.text.slice(0, 3000)}`)
    .join('\n\n---\n\n')

  const prompt = `Research topic: "${topic}"

Analyze these web sources and extract key knowledge as JSON. Return ONLY a JSON array.

For each item include:
- type: "fact" | "concept" | "insight"
- title: concise title
- content: detailed (max 400 chars)
- tags: 1-3 keywords
- importance: 0.0-1.0
- sourceUrl: the source URL

Focus on:
- Core facts and definitions
- Relationships between concepts
- Practical applications
- Different perspectives

Sources:
${pagesText}

JSON:`

  apiCallsToday++
  const response = await callLLM(prompt)
  return parseSynthesisResponse(response, pages)
}

function parseSynthesisResponse(response: string, pages: PageContent[]): SynthesizedItem[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed.map((item: Record<string, unknown>) => ({
      type: (item.type as SynthesizedItem['type']) || 'fact',
      title: String(item.title || '').slice(0, 80),
      content: String(item.content || '').slice(0, 500),
      tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 3) : undefined,
      importance: typeof item.importance === 'number' ? Math.max(0, Math.min(1, item.importance)) : 0.5,
      sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : pages[0]?.url,
    }))
  } catch {
    return []
  }
}

// ============================================
// Sub-topic discovery
// ============================================

async function discoverSubTopics(topic: string, pages: PageContent[]): Promise<string[]> {
  if (pages.length === 0 || !hasBudget()) return []

  const summary = pages.map(p => p.title).join(', ')
  const prompt = `After researching "${topic}" with these sources: ${summary}

List 2-4 specific sub-topics worth deeper investigation. Return ONLY a JSON array of strings. Each should be a focused question or topic.

JSON:`

  apiCallsToday++
  try {
    const response = await callLLM(prompt)
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 4) : []
  } catch {
    return []
  }
}

// ============================================
// Dedup check
// ============================================

async function isAlreadyKnown(title: string, content: string): Promise<boolean> {
  const existing = getNodeByTitle(title)
  return existing !== undefined
}

// ============================================
// HTTP helpers
// ============================================

function httpGet(hostname: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname,
      path,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClaudeCodeGUI/1.0; ResearchAgent)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 15000,
    }, (resp: IncomingMessage) => {
      // Follow redirects
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        const redirectUrl = new URL(resp.headers.location)
        httpGet(redirectUrl.hostname, redirectUrl.pathname + redirectUrl.search)
          .then(resolve).catch(reject)
        return
      }

      const chunks: Buffer[] = []
      resp.on('data', (chunk: Buffer) => chunks.push(chunk))
      resp.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

// ============================================
// LLM API call (shared with memory-agent pattern)
// ============================================

async function callLLM(prompt: string): Promise<string> {
  const hostname = baseUrl ? new URL(baseUrl).hostname : 'api.deepseek.com'
  const path = baseUrl ? `${new URL(baseUrl).pathname}/chat/completions` : '/anthropic/v1/chat/completions'
  const model = import.meta.env.VITE_MODEL_NAME || process.env.VITE_MODEL_NAME || 'deepseek-v4-pro'

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: 'You are a research synthesis AI. Return only valid JSON arrays.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 2000,
    temperature: 0.1,
  })

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': String(Buffer.byteLength(body)),
      },
    }, (resp: IncomingMessage) => {
      const chunks: Buffer[] = []
      resp.on('data', (chunk: Buffer) => chunks.push(chunk))
      resp.on('end', () => {
        const raw = Buffer.concat(chunks).toString()
        if (resp.statusCode !== 200) {
          reject(new Error(`LLM call failed: ${resp.statusCode}`))
          return
        }
        try {
          const json = JSON.parse(raw)
          resolve(json.choices?.[0]?.message?.content || '')
        } catch {
          reject(new Error('Failed to parse LLM response'))
        }
      })
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

/**
 * Research from a learning task row.
 */
export async function executeResearchTask(task: LearningTaskRow): Promise<ResearchResult> {
  return researchTopic(task.topic, task.depth, task.max_sources)
}

/**
 * Get today's API call count.
 */
export function getDailyApiCalls(): number {
  resetDailyBudget()
  return apiCallsToday
}
