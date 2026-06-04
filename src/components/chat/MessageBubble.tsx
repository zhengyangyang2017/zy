import { useMemo, memo, useState, useCallback } from 'react'
import { useI18n } from '../../i18n'
import type { Message } from '../../types'
import { Marked } from 'marked'
import { CodeBlock } from './CodeBlock'
import { StreamingDot } from './ThinkingIndicator'
import { useChatStore } from '../../stores/chatStore'
import { useSessionStore } from '../../stores/sessionStore'

const marked = new Marked()

interface Props {
  message: Message
  onEdit?: (message: Message) => void
  onBranch?: (message: Message) => void
}

interface ContentPart {
  type: 'text' | 'code'
  content: string
  language?: string
}

function parseContent(content: string): ContentPart[] {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
  const parts: ContentPart[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'code', language: match[1] || undefined, content: match[2].trim() })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) })
  }

  return parts
}

function RenderedMarkdown({ content }: { content: string }) {
  const html = useMemo(() => {
    const parsed = marked.parse(content)
    return typeof parsed === 'string' ? parsed : ''
  }, [content])

  return (
    <div
      className="markdown-body prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  const month = d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  return `${month} ${time}`
}

export const MessageBubble = memo(function MessageBubble({ message, onEdit, onBranch }: Props) {
  const { t } = useI18n()
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isStreaming = message.id === 'streaming'
  const parts = parseContent(message.content || '')
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)

  const setMessageFeedback = useChatStore((s) => s.setMessageFeedback)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  const handleCopy = useCallback(async () => {
    try {
      await window.api.copyToClipboard(message.content)
    } catch {
      navigator.clipboard.writeText(message.content)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const handleFeedback = useCallback((rating: 'up' | 'down') => {
    if (!activeSessionId) return
    setMessageFeedback(activeSessionId, message.id, rating)
  }, [activeSessionId, message.id, setMessageFeedback])

  const timestamp = formatTime(message.createdAt)

  // System messages: centered, compact, subtle
  if (isSystem) {
    return (
      <div className="flex justify-center mb-3">
        <div className="max-w-[85%] rounded-xl px-4 py-2 text-xs message-content bg-active/50 border border-hover text-text-secondary">
          {parts.map((part, i) =>
            part.type === 'code' ? (
              <CodeBlock key={i} language={part.language} code={part.content} />
            ) : (
              <RenderedMarkdown key={i} content={part.content} />
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : ''} group`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
          isUser ? 'bg-gray-600 text-gray-300' : 'bg-primary text-white'
        }`}
      >
        {isUser ? t('chat.userAvatar') : isStreaming ? (
          <span className="relative">
            🤖
            <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30" />
          </span>
        ) : '🤖'}
      </div>

      {/* Bubble */}
      <div className="flex flex-col max-w-[80%]">
        <div
          className={`rounded-2xl px-4 py-3 text-sm message-content ${
            isUser
              ? 'bg-active text-text-primary'
              : 'bg-hover text-text-primary'
          }`}
        >
          {parts.length > 0 ? (
            parts.map((part, i) =>
              part.type === 'code' ? (
                <CodeBlock key={i} language={part.language} code={part.content} />
              ) : (
                <RenderedMarkdown key={i} content={part.content} />
              )
            )
          ) : (
            <span className="text-text-muted italic">Thinking...</span>
          )}
          {isStreaming && <StreamingDot />}
        </div>

        {/* Timestamp */}
        <span className={`text-[10px] text-text-muted mt-0.5 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
          {timestamp}
        </span>

        {/* Action bar — shown on hover for assistant messages */}
        {!isUser && !isStreaming && !isSystem && (
          <div className={`flex items-center gap-1 ml-1 mt-1 transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
            <button onClick={handleCopy}
              className="text-[10px] text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded hover:bg-hover transition-colors"
              title="复制">
              {copied ? '✓ 已复制' : '📋'}
            </button>
            <button onClick={() => onEdit?.(message)}
              className="text-[10px] text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded hover:bg-hover transition-colors"
              title="重新生成">
              🔄
            </button>
            <button onClick={() => handleFeedback('up')}
              className={`text-[10px] px-1 py-0.5 rounded transition-colors ${message.feedback === 'up' ? 'text-green-400' : 'text-text-muted hover:text-green-400'}`}
              title="有用">
              👍
            </button>
            <button onClick={() => handleFeedback('down')}
              className={`text-[10px] px-1 py-0.5 rounded transition-colors ${message.feedback === 'down' ? 'text-red-400' : 'text-text-muted hover:text-red-400'}`}
              title="没用">
              👎
            </button>
            <button onClick={() => onBranch?.(message)}
              className="text-[10px] text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded hover:bg-hover transition-colors"
              title="从此处分支">
              🌿
            </button>
          </div>
        )}

        {/* Edit button for user messages — shown on hover */}
        {isUser && !isStreaming && (
          <div className={`flex justify-end mt-1 mr-1 transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
            <button onClick={() => onEdit?.(message)}
              className="text-[10px] text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded hover:bg-hover transition-colors"
              title="编辑">
              ✏️ 编辑
            </button>
          </div>
        )}
      </div>
    </div>
  )
})
