import { ipcMain, BrowserWindow } from 'electron'
import https from 'https'
import { IncomingMessage } from 'http'
import { onConversationTurn, getContextAugmentation } from './learning/orchestrator'
import { loadConfig } from './config'
import { logger } from './logger'
import { getOrchestrator } from './cluster'
import type { TaskType, AgentRole } from './cluster/types'

function getApiConfig() {
  const cfg = loadConfig()
  return {
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    modelName: cfg.model,
  }
}

function isAnthropicKey(key: string): boolean {
  return key.startsWith('sk-ant')
}

// Detect provider: Anthropic, DeepSeek, OpenAI, or generic OpenAI-compatible
function detectProvider(): { provider: 'anthropic' | 'deepseek' | 'openai' | 'openai-compat'; host: string; path: string; model: string } {
  const { apiKey, baseUrl, modelName } = getApiConfig()

  // If key is Anthropic, use Anthropic Messages API
  if (isAnthropicKey(apiKey)) {
    return {
      provider: 'anthropic',
      host: baseUrl ? new URL(baseUrl).hostname : 'api.anthropic.com',
      path: baseUrl ? `${new URL(baseUrl).pathname}/messages` : '/v1/messages',
      model: modelName || 'claude-sonnet-4-6',
    }
  }

  // OpenAI-compatible (Chat Completions API) — covers DeepSeek, OpenAI, and others
  const host = baseUrl ? new URL(baseUrl).hostname : 'api.openai.com'
  const path = baseUrl ? `${new URL(baseUrl).pathname}/chat/completions` : '/v1/chat/completions'
  const model = modelName || 'gpt-4o'

  if (host.includes('deepseek')) {
    return { provider: 'deepseek', host, path, model }
  }
  if (host.includes('openai')) {
    return { provider: 'openai', host, path, model }
  }
  return { provider: 'openai-compat', host, path, model }
}

function buildClusterAwarePrompt(knowledgeContext: string): string {
  const base = `You are Claude, a powerful AI agent running inside Claude Code GUI.

## Your Capabilities

You have a 20-agent cluster at your disposal. Each agent is a specialized worker that runs asynchronously. You can submit tasks to the cluster to distribute work:

| Agent Role   | What It Does |
|-------------|-------------|
| 🔍 research  | Searches the web (DuckDuckGo), fetches pages, synthesizes knowledge |
| ⚡ code-gen  | Generates clean, well-structured code with error handling |
| 👁 code-review | Reviews code for bugs, security issues, performance problems |
| 🧠 memory    | Extracts and stores facts, concepts, preferences from conversations |
| 🔄 evolution | Analyzes response quality, suggests improvement strategies |
| ✅ verify    | Verifies output correctness, runs quality assurance checks |
| 📡 monitor   | Monitors git status, file changes, system resources |
| 🤖 general   | Handles any task type, adapts dynamically |

The cluster uses:
- **Work-stealing queue**: idle agents automatically steal tasks from busy ones
- **Idempotency**: duplicate tasks are detected and skipped automatically
- **Pub/Sub events**: agents communicate asynchronously via topic-based events
- **Shared state**: all agents share knowledge via the knowledge graph (SQLite with vector search)

## How to Use the Cluster

**To dispatch work to the cluster, include a JSON block at the END of your response** using this format:

\`\`\`cluster
{"action": "research", "goal": "what to investigate"}
\`\`\`

Or for multiple tasks:

\`\`\`cluster
{"action": "code-gen", "goal": "create a React hook for dark mode"}
{"action": "code-review", "goal": "review the authentication middleware"}
\`\`\`

Available actions: research, code-gen, code-review, memory-extract, verify, monitor

**Important**: Only include the cluster block when you genuinely need the agents to do background work. Don't include it for simple Q&A.

The cluster operates **asynchronously** — after you dispatch, results will appear as system messages in the chat when agents complete.

## Your Workflow

1. Answer the user's question directly and concisely
2. If they ask for research, code generation, or analysis that benefits from background processing, add a cluster JSON block at the end
3. The system automatically parses your cluster block, submits tasks, and shows results when done
4. Don't mention "I'll dispatch this to the cluster" unless it's natural — the JSON block handles it silently

## Conversation Style

- Be direct and concise
- When relevant, mention which agents are handling background work
- Show enthusiasm for the cluster's parallel processing power
- If a user task is complex, suggest breaking it down for the cluster

You are not just a terminal assistant. You are the central intelligence of a multi-agent system.`

  if (knowledgeContext) {
    return `${base}\n\n## Relevant Knowledge from Memory\n${knowledgeContext}`
  }
  return base
}

interface ChatParams {
  sessionId: string
  messages: { role: 'user' | 'assistant'; content: string }[]
}

const activeStreams = new Map<string, AbortController>()

export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (event, params: ChatParams) => {
    // Validate inputs
    const { validateString, validateMessages } = await import('./ipc-validator')
    const sidCheck = validateString(params.sessionId, 'sessionId', 100)
    if (!sidCheck.valid) throw new Error(sidCheck.error)
    const msgCheck = validateMessages(params.messages)
    if (!msgCheck.valid) throw new Error(msgCheck.error)

    const { sessionId, messages } = params
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window')

    const providerInfo = detectProvider()
    logger.debug('chat:send', `session=${sessionId} messages=${messages.length} provider=${providerInfo.provider} model=${providerInfo.model}`)

    const { apiKey } = getApiConfig()
    if (!apiKey) {
      win.webContents.send('chat:stream-error', { sessionId, error: 'API key 未配置' })
      throw new Error('API key not set')
    }

    // Prevent overwriting an active stream for the same session
    if (activeStreams.has(sessionId)) {
      logger.warn('chat:send', `Session ${sessionId} already has an active stream, aborting previous`)
      activeStreams.get(sessionId)?.abort()
    }
    const abortController = new AbortController()
    activeStreams.set(sessionId, abortController)

    try {
      // Retrieve relevant knowledge context
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()
      const knowledgeContext = lastUserMsg ? await getContextAugmentation(lastUserMsg.content).catch(() => '') : ''

      let fullContent = ''

      if (providerInfo.provider === 'anthropic') {
        fullContent = await streamAnthropic(win, sessionId, messages, knowledgeContext, abortController.signal, providerInfo)
      } else {
        fullContent = await streamOpenAICompat(win, sessionId, messages, knowledgeContext, abortController.signal, providerInfo)
      }

      // Parse and strip cluster directives from response
      // Skip if stream was aborted (partial content)
      const wasAborted = abortController.signal.aborted
      let displayContent = fullContent

      if (!wasAborted) {
        const clusterBlockRegex = /```cluster\n([\s\S]*?)```/g
        let clusterMatch
        const clusterDirectives: { action: string; goal: string }[] = []

        while ((clusterMatch = clusterBlockRegex.exec(fullContent)) !== null) {
          const lines = clusterMatch[1].trim().split('\n')
          for (const line of lines) {
            try {
              const directive = JSON.parse(line.trim())
              if (directive.action && directive.goal) {
                clusterDirectives.push(directive)
              }
            } catch { /* skip malformed lines */ }
          }
        }
        // Strip cluster blocks from displayed content
        displayContent = fullContent.replace(/```cluster\n[\s\S]*?```/g, '').trim()

        // Submit parsed cluster directives
        if (clusterDirectives.length > 0) {
          const orch = getOrchestrator()
          for (const d of clusterDirectives) {
            orch.submitTask(
              d.action as TaskType,
              'general' as AgentRole,
              { query: d.goal, context: displayContent.slice(0, 1000) },
              0.8,
              null,
            )
            logger.info('chat:send', `Cluster task dispatched: ${d.action} — "${d.goal.slice(0, 80)}"`)
          }
          win.webContents.send('chat:cluster-result', {
            taskType: 'decompose',
            taskId: `dispatch_${Date.now()}`,
            output: `已向集群提交 ${clusterDirectives.length} 个任务：${clusterDirectives.map(d => d.action).join(', ')}`,
            success: true,
          })
        }
      }

      const message = {
        id: `msg_${Date.now()}`,
        sessionId,
        role: 'assistant' as const,
        content: displayContent,
        createdAt: new Date().toISOString()
      }

      logger.debug('chat:send', `stream done, content length=${displayContent.length}`)
      activeStreams.delete(sessionId)
      win.webContents.send('chat:stream-done', { sessionId, message })

      // Fire-and-forget: trigger memory extraction in background (skip if aborted)
      if (lastUserMsg && !wasAborted) {
        onConversationTurn(sessionId, lastUserMsg.content, fullContent).catch(err =>
          logger.error('chat:send', 'Memory extraction error:', err)
        )
      }

      return message
    } catch (err) {
      activeStreams.delete(sessionId)
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      logger.error('chat:send', `ERROR: ${errorMsg}`)
      win.webContents.send('chat:stream-error', { sessionId, error: errorMsg })
      throw err
    }
  })

  ipcMain.handle('chat:abort', async (_event, sessionId: string) => {
    const ctrl = activeStreams.get(sessionId)
    if (ctrl) {
      ctrl.abort()
      activeStreams.delete(sessionId)
      return true
    }
    return false
  })
}

function httpsRequest(opts: {
  hostname: string
  path: string
  method: string
  headers: Record<string, string>
  body: string
  signal: AbortSignal
}): Promise<{ resp: IncomingMessage }> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: opts.hostname,
      path: opts.path,
      method: opts.method,
      headers: opts.headers
    }, (resp) => {
      resolve({ resp })
    })

    req.on('error', (err: NodeJS.ErrnoException & { errors?: Error[] }) => {
      if (err.name === 'AbortError' || err.code === 'ECONNRESET') return
      // Unwrap AggregateError to show individual causes
      if (err.name === 'AggregateError' && err.errors) {
        const details = err.errors.map((e: Error) => e.message).join('; ')
        reject(new Error(`Network error: ${details}`))
        return
      }
      reject(new Error(`${err.code || err.name}: ${err.message}`))
    })

    if (opts.signal) {
      opts.signal.addEventListener('abort', () => req.destroy())
    }

    req.write(opts.body)
    req.end()
  })
}

interface ProviderInfo {
  provider: string
  host: string
  path: string
  model: string
}

async function streamAnthropic(
  win: Electron.BrowserWindow,
  sessionId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  knowledgeContext: string,
  signal: AbortSignal,
  provider: ProviderInfo,
): Promise<string> {
  const systemPrompt = buildClusterAwarePrompt(knowledgeContext)
  const { apiKey } = getApiConfig()

  const body = JSON.stringify({
    model: provider.model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }]
    })),
    stream: true
  })

  const { resp } = await httpsRequest({
    hostname: provider.host,
    path: provider.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': String(Buffer.byteLength(body))
    },
    body,
    signal
  })

  if (resp.statusCode !== 200) {
    const chunks: Buffer[] = []
    for await (const chunk of resp) chunks.push(chunk)
    throw new Error(`${resp.statusCode} ${Buffer.concat(chunks).toString()}`)
  }

  return readSSE(resp, (data) => {
    try {
      const parsed = JSON.parse(data)
      if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
        win.webContents.send('chat:stream-chunk', { sessionId, chunk: parsed.delta.text })
        return parsed.delta.text
      }
    } catch { /* skip malformed SSE line */ }
    return ''
  })
}

async function streamOpenAICompat(
  win: Electron.BrowserWindow,
  sessionId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  knowledgeContext: string,
  signal: AbortSignal,
  provider: ProviderInfo,
): Promise<string> {
  const systemContent = buildClusterAwarePrompt(knowledgeContext)
  const { apiKey } = getApiConfig()

  const body = JSON.stringify({
    model: provider.model,
    messages: [
      { role: 'system', content: systemContent },
      ...messages.map((m) => ({ role: m.role, content: m.content }))
    ],
    stream: true
  })

  const { resp } = await httpsRequest({
    hostname: provider.host,
    path: provider.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': String(Buffer.byteLength(body))
    },
    body,
    signal
  })

  if (resp.statusCode !== 200) {
    const chunks: Buffer[] = []
    for await (const chunk of resp) chunks.push(chunk)
    throw new Error(`${resp.statusCode} ${Buffer.concat(chunks).toString()}`)
  }

  return readSSE(resp, (data) => {
    try {
      if (data === '[DONE]') return ''
      const parsed = JSON.parse(data)
      const delta = parsed.choices?.[0]?.delta?.content
      if (delta) {
        win.webContents.send('chat:stream-chunk', { sessionId, chunk: delta })
        return delta
      }
    } catch { /* skip malformed SSE line */ }
    return ''
  })
}

async function readSSE(
  resp: IncomingMessage,
  onData: (data: string) => string
): Promise<string> {
  let fullContent = ''
  let buffer = ''

  for await (const chunk of resp) {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const text = onData(line.slice(6))
        fullContent += text
      }
    }
  }

  return fullContent
}
