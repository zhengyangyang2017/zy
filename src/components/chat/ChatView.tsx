import { useEffect, useRef, useMemo, useCallback } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { ThinkingIndicator } from './ThinkingIndicator'
import type { Message } from '../../types'

const TASK_ICONS: Record<string, string> = {
  research: '🔍',
  'code-gen': '⚡',
  'code-review': '👁',
  'memory-extract': '🧠',
  evolution: '🔄',
  verify: '✅',
  'monitor-check': '📡',
  decompose: '📋',
  synthesize: '🧩',
}

const EMPTY_MSGS: Message[] = []

export function ChatView() {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  const messagesBySession = useChatStore((s) => s.messagesBySession)
  const streamingTextBySession = useChatStore((s) => s.streamingText)
  const streamBySession = useChatStore((s) => s.streamBySession)
  const addMessage = useChatStore((s) => s.addMessage)

  const messages = useMemo(() =>
    activeSessionId ? (messagesBySession[activeSessionId] ?? EMPTY_MSGS) : EMPTY_MSGS,
    [activeSessionId, messagesBySession]
  )
  const streamingText = useMemo(() =>
    activeSessionId ? (streamingTextBySession[activeSessionId] ?? '') : '',
    [activeSessionId, streamingTextBySession]
  )
  const isStreaming = useMemo(() =>
    activeSessionId ? (streamBySession[activeSessionId]?.isStreaming ?? false) : false,
    [activeSessionId, streamBySession]
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const activeSessionRef = useRef(activeSessionId)
  activeSessionRef.current = activeSessionId

  // Listen for agent cluster results
  useEffect(() => {
    if (typeof window.api?.onClusterResult !== 'function') return
    const cleanup = window.api.onClusterResult((data) => {
      const sid = activeSessionRef.current
      if (!sid) return

      const icon = data.taskType ? (TASK_ICONS[data.taskType] || '🤖') : '🤖'
      const content = data.success
        ? `${icon} **Agent 集群任务完成** (${data.taskType || 'unknown'})\n\n${data.output || ''}`
        : `${icon} **Agent 集群任务失败**\n\n${data.error || '未知错误'}`

      const msg: Message = {
        id: `cluster_${data.taskId}_${Date.now()}`,
        sessionId: sid,
        role: 'system',
        content,
        createdAt: new Date().toISOString(),
      }
      addMessage(sid, msg)
    })
    return () => { cleanup() }
  }, [addMessage])

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

      {/* Thinking animation: streaming started but no text yet */}
      {isStreaming && !streamingText && (
        <ThinkingIndicator />
      )}

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
