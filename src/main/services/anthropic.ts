import Anthropic from '@anthropic-ai/sdk'
import { ipcMain, BrowserWindow } from 'electron'

let apiKey = process.env.ANTHROPIC_API_KEY || ''

export function setApiKey(key: string): void {
  apiKey = key
}

export function getApiKey(): string {
  return apiKey
}

function getClient(): Anthropic {
  if (!apiKey) throw new Error('API key not set')
  return new Anthropic({ apiKey })
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

    const abortController = new AbortController()
    activeStreams.set(sessionId, abortController)

    try {
      const client = getClient()
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: 'You are Claude, an AI coding assistant. Respond helpfully and concisely.',
        messages: messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
      }, {
        signal: abortController.signal
      })

      let fullContent = ''

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && 'text' in event.delta) {
          fullContent += event.delta.text
          win.webContents.send('chat:stream-chunk', {
            sessionId,
            chunk: event.delta.text
          })
        }
      }

      const message = {
        id: `msg_${Date.now()}`,
        sessionId,
        role: 'assistant' as const,
        content: fullContent,
        createdAt: new Date().toISOString()
      }

      activeStreams.delete(sessionId)
      win.webContents.send('chat:stream-done', { sessionId, message })
      return message
    } catch (err) {
      activeStreams.delete(sessionId)
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
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
