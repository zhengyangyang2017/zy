/**
 * Agent Role Implementations — task-type-specific execution logic.
 *
 * Each role implements an async handler that:
 * 1. Builds an LLM prompt from task input
 * 2. Calls the LLM API
 * 3. Returns a structured TaskResult
 *
 * All roles share a common LLM calling interface.
 */

import https from 'https'
import { IncomingMessage } from 'http'
import type { Task, TaskResult, AgentId } from './types'
import { embed } from '../learning/embeddings'
import { createNode, getNodeByTitle, createEdge } from '../learning/knowledge-graph'
import { searchWeb, readPages } from '../search'

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const baseUrl = import.meta.env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || ''
const modelName = import.meta.env.VITE_MODEL_NAME || process.env.VITE_MODEL_NAME || 'deepseek-v4-pro'

// ============================================
// LLM call
// ============================================

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4096,
  temperature: number = 0.3,
): Promise<string> {
  const hostname = baseUrl ? new URL(baseUrl).hostname : 'api.deepseek.com'
  const path = baseUrl ? `${new URL(baseUrl).pathname}/chat/completions` : '/anthropic/v1/chat/completions'

  const body = JSON.stringify({
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
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

// ============================================
// Role: Research
// ============================================

async function handleResearch(task: Task, agentId: AgentId): Promise<TaskResult> {
  const query = task.input.query || 'Unknown topic'
  const depth = (task.input.constraints?.length || 0) > 0 ? 3 : 2

  // Web search with multi-strategy fallback
  let sources = ''
  try {
    const urls = await searchWeb(query, 5)
    const pages = await readPages(urls, 3)
    sources = pages
      .map(p => `[Source: ${p.url}]\n${p.text.slice(0, 3000)}`)
      .join('\n\n---\n\n')
  } catch (err) {
    console.warn(`[AgentRoles:research] Search failed:`, err)
  }

  const prompt = sources
    ? `Research topic: "${query}"\n\nSources:\n${sources}\n\nProvide a comprehensive analysis with citations.`
    : `Research topic: "${query}"\n\nProvide a thorough analysis based on your knowledge.`

  const output = await callLLM(
    'You are an expert research agent. Provide accurate, detailed, well-structured analysis.',
    prompt,
    4096,
    0.3,
  )

  // Store in knowledge graph
  try {
    const vector = await embed(`${query}\n${output.slice(0, 500)}`)
    createNode({
      type: 'concept',
      title: query.slice(0, 80),
      content: output.slice(0, 2000),
      summary: output.slice(0, 200),
      tags: query.split(/\s+/).slice(0, 3),
      source: 'web_search',
      importance: 0.7,
      confidence: 0.7,
    }, vector)
  } catch (err) {
    console.error('[AgentRoles:research] Failed to store knowledge node:', err)
  }

  return {
    taskId: task.id,
    agentId,
    success: true,
    output,
    tokensUsed: output.length,
    durationMs: 0, // Set by caller
    errors: [],
    warnings: sources ? [] : ['No web sources found, using base knowledge'],
  }
}

// ============================================
// Role: Code Generation
// ============================================

async function handleCodeGen(task: Task, agentId: AgentId): Promise<TaskResult> {
  const query = task.input.query || 'Generate code'
  const context = task.input.context || ''
  const files = task.input.files || []

  const filesContext = files.length > 0
    ? `\nRelevant files:\n${files.join('\n')}`
    : ''

  const output = await callLLM(
    'You are an expert software engineer. Write clean, well-structured code. Include error handling. Output ONLY the code with brief comments.',
    `${context}\n\nTask: ${query}${filesContext}`,
    8192,
    0.2,
  )

  return {
    taskId: task.id,
    agentId,
    success: true,
    output,
    tokensUsed: output.length,
    durationMs: 0,
    errors: [],
    warnings: [],
  }
}

// ============================================
// Role: Code Review
// ============================================

async function handleCodeReview(task: Task, agentId: AgentId): Promise<TaskResult> {
  const code = task.input.context || task.input.query || ''
  const constraints = task.input.constraints || []

  const output = await callLLM(
    'You are a meticulous code reviewer. Identify bugs, security issues, performance problems, and style violations. Be specific and actionable.',
    `Review this code:\n\n${code}\n\nFocus on: ${constraints.join(', ') || 'correctness, security, performance, readability'}`,
    4096,
    0.2,
  )

  return {
    taskId: task.id,
    agentId,
    success: true,
    output,
    tokensUsed: output.length,
    durationMs: 0,
    errors: [],
    warnings: [],
  }
}

// ============================================
// Role: Memory Extraction
// ============================================

async function handleMemoryExtract(task: Task, agentId: AgentId): Promise<TaskResult> {
  const text = task.input.query || task.input.context || ''
  if (!text || text.length < 50) {
    return {
      taskId: task.id,
      agentId,
      success: true,
      output: 'Not enough content to extract knowledge',
      tokensUsed: 0,
      durationMs: 0,
      errors: [],
      warnings: ['Input too short'],
    }
  }

  const output = await callLLM(
    `You are a knowledge extraction AI. Extract key facts, concepts, preferences, and insights. Return ONLY a JSON array:
[{"type":"fact|concept|preference|insight","title":"short title","content":"detailed","tags":["tag1"],"importance":0.5}]`,
    text.slice(0, 4000),
    2000,
    0.1,
  )

  // Parse and store nodes
  try {
    const jsonMatch = output.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const items = JSON.parse(jsonMatch[0])
      for (const item of items) {
        const nodeText = `${item.title}\n${item.content}`
        const vector = await embed(nodeText)
        createNode({
          type: item.type || 'fact',
          title: String(item.title || '').slice(0, 80),
          content: String(item.content || '').slice(0, 500),
          summary: String(item.content || '').slice(0, 200),
          tags: Array.isArray(item.tags) ? item.tags.slice(0, 3) : [],
          source: 'conversation',
          importance: Math.max(0, Math.min(1, item.importance || 0.4)),
          confidence: 0.6,
        }, vector)
      }
    }
  } catch { /* parsing is best-effort */ }

  return {
    taskId: task.id,
    agentId,
    success: true,
    output,
    tokensUsed: output.length,
    durationMs: 0,
    errors: [],
    warnings: [],
  }
}

// ============================================
// Role: Evolution
// ============================================

async function handleEvolution(task: Task, agentId: AgentId): Promise<TaskResult> {
  const context = task.input.context || ''

  const output = await callLLM(
    `You are a self-improvement analyst. Analyze AI response quality and suggest strategies.
Return ONLY a JSON array:
[{"name":"strategy-name","rule":"what to do differently","finding":"pattern found","severity":"low|medium|high","action":"specific action"}]`,
    context.slice(0, 4000),
    2000,
    0.1,
  )

  return {
    taskId: task.id,
    agentId,
    success: true,
    output,
    tokensUsed: output.length,
    durationMs: 0,
    errors: [],
    warnings: [],
  }
}

// ============================================
// Role: Verify
// ============================================

async function handleVerify(task: Task, agentId: AgentId): Promise<TaskResult> {
  const toVerify = task.input.context || task.input.query || ''
  const expectedOutput = task.input.expectedOutput || ''

  const output = await callLLM(
    'You are a quality assurance verifier. Check if the output matches expectations. Be strict and specific.',
    `Expected: ${expectedOutput}\n\nActual output to verify:\n${toVerify.slice(0, 4000)}\n\nProvide a verdict (PASS/FAIL) and detailed feedback.`,
    2048,
    0.1,
  )

  const passed = output.includes('PASS') && !output.includes('FAIL')

  return {
    taskId: task.id,
    agentId,
    success: passed,
    output,
    tokensUsed: output.length,
    durationMs: 0,
    errors: passed ? [] : ['Verification failed'],
    warnings: [],
  }
}

// ============================================
// Role: Monitor
// ============================================

async function handleMonitor(task: Task, agentId: AgentId): Promise<TaskResult> {
  // Monitor tasks check system state, file changes, git status
  // They're lightweight — mostly reading state and reporting
  const checks: string[] = []

  try {
    const { execSync } = await import('child_process')
    // Git status check
    try {
      const status = execSync('git status --short', { encoding: 'utf-8', timeout: 5000 }).trim()
      if (status) checks.push(`Git changes detected:\n${status}`)
      else checks.push('Git: clean')
    } catch {
      checks.push('Git: unable to check')
    }

    // Node process check
    const memUsage = process.memoryUsage()
    checks.push(`Memory: heap=${(memUsage.heapUsed / 1024 / 1024).toFixed(0)}MB, rss=${(memUsage.rss / 1024 / 1024).toFixed(0)}MB`)
  } catch (err) {
    checks.push(`Monitor error: ${err}`)
  }

  return {
    taskId: task.id,
    agentId,
    success: true,
    output: checks.join('\n'),
    tokensUsed: 0,
    durationMs: 0,
    errors: [],
    warnings: [],
  }
}

// ============================================
// Role: Decompose (Orchestrator helper)
// ============================================

async function handleDecompose(task: Task, agentId: AgentId): Promise<TaskResult> {
  const goal = task.input.query || ''

  const output = await callLLM(
    `You are a task decomposition specialist. Break down complex goals into sub-tasks.
Return ONLY a JSON object:
{
  "name": "workflow name",
  "type": "parallel|sequential",
  "subtasks": [
    {"label": "task label", "type": "research|code-gen|code-review|memory-extract|verify|custom", "query": "what to do", "priority": 0.8}
  ]
}`,
    goal,
    2048,
    0.2,
  )

  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const plan = JSON.parse(jsonMatch[0])
      return {
        taskId: task.id,
        agentId,
        success: true,
        output,
        structuredOutput: plan,
        tokensUsed: output.length,
        durationMs: 0,
        errors: [],
        warnings: [],
      }
    }
  } catch { /* fall through */ }

  return {
    taskId: task.id,
    agentId,
    success: true,
    output,
    structuredOutput: { type: 'sequential', subtasks: [{ label: goal, type: 'research', query: goal, priority: 0.8 }] },
    tokensUsed: output.length,
    durationMs: 0,
    errors: [],
    warnings: ['Could not parse decomposition, using default'],
  }
}

// ============================================
// Role: Synthesize
// ============================================

async function handleSynthesize(task: Task, agentId: AgentId): Promise<TaskResult> {
  const parts = task.input.previousResults || []
  const query = task.input.query || 'Synthesize results'

  const partsText = parts
    .map((r, i) => `[Result ${i + 1}]\n${r.output.slice(0, 2000)}`)
    .join('\n\n---\n\n')

  const output = await callLLM(
    'You are a synthesis specialist. Combine multiple research/code results into a coherent, unified response.',
    `Goal: ${query}\n\nInputs to synthesize:\n${partsText}\n\nProvide a unified, comprehensive response.`,
    8192,
    0.3,
  )

  return {
    taskId: task.id,
    agentId,
    success: true,
    output,
    tokensUsed: output.length,
    durationMs: 0,
    errors: [],
    warnings: [],
  }
}

// ============================================
// Role dispatcher
// ============================================

export type RoleHandler = (task: Task, agentId: AgentId) => Promise<TaskResult>

const roleHandlers: Record<string, RoleHandler> = {
  'research': handleResearch,
  'code-gen': handleCodeGen,
  'code-review': handleCodeReview,
  'memory-extract': handleMemoryExtract,
  'evolution': handleEvolution,
  'verify': handleVerify,
  'monitor-check': handleMonitor,
  'decompose': handleDecompose,
  'synthesize': handleSynthesize,
  'custom': handleResearch, // Fallback to research for unknown task types
}

export function getRoleHandler(taskType: string): RoleHandler {
  return roleHandlers[taskType] || roleHandlers['custom']
}

/** Check if API key is available. Agents won't work without it. */
export function hasApiKey(): boolean {
  return apiKey.length > 0
}

/** Get the model being used. */
export function getModelName(): string {
  return modelName
}
