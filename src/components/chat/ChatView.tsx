import { useEffect, useRef, useMemo } from 'react'
import { useI18n } from '../../i18n'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { ThinkingIndicator } from './ThinkingIndicator'
import { VirtualMessageList } from './VirtualMessageList'
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
  const { t } = useI18n()
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

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-base">
        <p className="text-text-muted">{t('chat.noSession')}</p>
      </div>
    )
  }

  const hasMessages = messages.length > 0
  const hasStreamingContent = isStreaming || streamingText
  const showEmpty = !hasMessages && !hasStreamingContent

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 pt-6">
      {showEmpty && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-2xl mb-2">🤖</p>
            <p className="text-text-secondary">{t('chat.empty')}</p>
          </div>
        </div>
      )}

      {hasMessages && (
        <div className="flex-1 min-h-0">
          <VirtualMessageList messages={messages} />
        </div>
      )}

      {/* Thinking animation + streaming content (below committed messages) */}
      {isStreaming && !streamingText && (
        <div className="flex-shrink-0">
          <ThinkingIndicator />
        </div>
      )}

      {streamingText && (
        <div className="flex-shrink-0">
          <MessageBubble
            message={{
              id: 'streaming',
              sessionId: activeSessionId,
              role: 'assistant',
              content: streamingText,
              createdAt: new Date().toISOString()
            }}
          />
        </div>
      )}
    </div>
  )
}
