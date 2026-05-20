import { useEffect, useRef } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../../types'

export function ChatView() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const messages = useChatStore((s) =>
    activeSessionId ? (s.messagesBySession[activeSessionId] ?? []) : []
  )
  const streamingText = useChatStore((s) =>
    activeSessionId ? (s.streamingText[activeSessionId] ?? '') : ''
  )
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-base">
        <p className="text-text-muted">选择或创建一个会话开始</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      {messages.length === 0 && !streamingText && (
        <div className="text-center mt-20">
          <p className="text-2xl mb-2">🤖</p>
          <p className="text-text-secondary">开始对话吧</p>
        </div>
      )}

      {messages.map((msg: Message) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}

      {streamingText && (
        <MessageBubble
          message={{
            id: 'streaming',
            sessionId: activeSessionId,
            role: 'assistant',
            content: streamingText,
            createdAt: new Date().toISOString()
          }}
        />
      )}

      <div ref={bottomRef} />
    </div>
  )
}
