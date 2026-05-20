import { useState, useCallback } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import type { Message } from '../../types'

export function InputArea() {
  const [input, setInput] = useState('')
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const { addMessage, appendToStream, commitStream, setStreaming, clearStream } =
    useChatStore()
  const isStreaming = useChatStore((s) =>
    activeSessionId ? (s.streamBySession[activeSessionId]?.isStreaming ?? false) : false
  )

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if (!content || !activeSessionId) return

    setInput('')
    const userMsg = {
      id: `msg_${Date.now()}`,
      sessionId: activeSessionId,
      role: 'user' as const,
      content,
      createdAt: new Date().toISOString()
    }
    addMessage(activeSessionId, userMsg)
    setStreaming(activeSessionId, true)

    const msgs = useChatStore.getState().messagesBySession[activeSessionId] ?? []

    try {
      const cleanup1 = window.api.onStreamChunk((data) => {
        if (data.sessionId === activeSessionId) {
          appendToStream(activeSessionId, data.chunk)
        }
      })
      const cleanup2 = window.api.onStreamDone((data) => {
        if (data.sessionId === activeSessionId) {
          commitStream(activeSessionId, data.message as Message)
          setStreaming(activeSessionId, false)
        }
      })
      const cleanup3 = window.api.onStreamError((data) => {
        if (data.sessionId === activeSessionId) {
          clearStream(activeSessionId)
          setStreaming(activeSessionId, false)
        }
      })

      await window.api.sendMessage({
        sessionId: activeSessionId,
        messages: msgs.map((m) => ({ role: m.role, content: m.content }))
      })

      cleanup1(); cleanup2(); cleanup3()
    } catch {
      clearStream(activeSessionId)
      setStreaming(activeSessionId, false)
    }
  }, [input, activeSessionId])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!activeSessionId) return null

  return (
    <div className="border-t border-hover p-4 bg-surface">
      <div className="flex items-end gap-3 max-w-4xl mx-auto">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，Shift+Enter 换行，Enter 发送..."
          rows={1}
          className="flex-1 bg-elevated border border-hover rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-primary transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          className="px-5 py-3 bg-primary text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {isStreaming ? '...' : '↑'}
        </button>
      </div>
    </div>
  )
}
