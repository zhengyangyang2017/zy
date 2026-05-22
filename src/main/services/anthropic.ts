import { ipcMain, BrowserWindow } from 'electron'
import https from 'https'
import { IncomingMessage } from 'http'
import { onConversationTurn, getContextAugmentation } from './learning/orchestrator'

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const baseUrl = import.meta.env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || ''
const openaiModel = import.meta.env.VITE_MODEL_NAME || process.env.VITE_MODEL_NAME || 'gpt-4o'

function isAnthropicKey(key: string): boolean {
  return key.startsWith('sk-ant')
}

interface ChatParams {
  sessionId: string
  messages: { role: 'user' | 'assistant'; content: string }[]
}

const activeStreams = new Map<string, AbortController>()

export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (event, params: ChatParams) => {
    const { sessionId, messages } = params
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('No window')

    const isAnthropic = isAnthropicKey(apiKey)
    const provider = isAnthropic ? 'anthropic' : 'openai'
    console.log(`[chat:send] session=${sessionId} messages=${messages.length} provider=${provider}`)

    if (!apiKey) {
      win.webContents.send('chat:stream-error', { sessionId, error: 'API key 未配置' })
      throw new Error('API key not set')
    }

    const abortController = new AbortController()
    activeStreams.set(sessionId, abortController)

    try {
      // Retrieve relevant knowledge context (safe: catches embedding errors)
      const lastUserMsg = messages.filter(m => m.role === 'user').pop()
      const knowledgeContext = lastUserMsg ? await getContextAugmentation(lastUserMsg.content).catch(() => '') : ''

      let fullContent = ''

      if (isAnthropic) {
        fullContent = await streamAnthropic(win, sessionId, messages, knowledgeContext, abortController.signal)
      } else {
        fullContent = await streamOpenAI(win, sessionId, messages, knowledgeContext, abortController.signal)
      }

      const message = {
        id: `msg_${Date.now()}`,
        sessionId,
        role: 'assistant' as const,
        content: fullContent,
        createdAt: new Date().toISOString()
      }

      console.log(`[chat:send] stream done, content length=${fullContent.length}`)
      activeStreams.delete(sessionId)
      win.webContents.send('chat:stream-done', { sessionId, message })

      // Fire-and-forget: trigger memory extraction in background
      if (lastUserMsg) {
        onConversationTurn(sessionId, lastUserMsg.content, fullContent).catch(err =>
          console.error('[chat:send] Memory extraction error:', err)
        )
      }

      return message
    } catch (err) {
      activeStreams.delete(sessionId)
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      console.error(`[chat:send] ERROR: ${errorMsg}`)
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

async function streamAnthropic(
  win: Electron.BrowserWindow,
  sessionId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  knowledgeContext: string,
  signal: AbortSignal
): Promise<string> {
  const systemPrompt = knowledgeContext
    ? `You are Claude, an AI coding assistant. Respond helpfully and concisely.\n\n${knowledgeContext}`
    : 'You are Claude, an AI coding assistant. Respond helpfully and concisely.'

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: [{ type: 'text', text: m.content }]
    })),
    stream: true
  })

  const { resp } = await httpsRequest({
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
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
    } catch { /* skip */ }
    return ''
  })
}

async function streamOpenAI(
  win: Electron.BrowserWindow,
  sessionId: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
  knowledgeContext: string,
  signal: AbortSignal
): Promise<string> {
  const systemContent = knowledgeContext
    ? `You are a helpful AI assistant.\n\n${knowledgeContext}`
    : 'You are a helpful AI assistant.'

  const body = JSON.stringify({
    model: openaiModel,
    messages: [
      { role: 'system', content: systemContent },
      ...messages.map((m) => ({ role: m.role, content: m.content }))
    ],
    stream: true
  })

  const openaiHost = baseUrl ? new URL(baseUrl).hostname : 'api.openai.com'
  const openaiPath = baseUrl ? `${new URL(baseUrl).pathname}/chat/completions` : '/v1/chat/completions'

  const { resp } = await httpsRequest({
    hostname: openaiHost,
    path: openaiPath,
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
    } catch { /* skip */ }
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
