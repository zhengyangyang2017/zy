import { useMemo, memo } from 'react'
import { useI18n } from '../../i18n'
import type { Message } from '../../types'
import { Marked } from 'marked'
import { CodeBlock } from './CodeBlock'
import { StreamingDot } from './ThinkingIndicator'

const marked = new Marked()

interface Props {
  message: Message
}

interface ContentPart {
  type: 'text' | 'code'
  content: string
  language?: string
}

/** Split markdown content into text and code-block segments, with markdown rendered for text */
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

export const MessageBubble = memo(function MessageBubble({ message }: Props) {
  const { t } = useI18n()
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isStreaming = message.id === 'streaming'
  const parts = parseContent(message.content || '')

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
    <div className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : ''}`}>
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
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm message-content ${
          isUser
            ? 'bg-active text-text-primary'
            : 'bg-hover text-text-primary'
        }`}
      >
        {parts.length > 0 ? (
          <>
            {parts.map((part, i) =>
              part.type === 'code' ? (
                <CodeBlock key={i} language={part.language} code={part.content} />
              ) : (
                <RenderedMarkdown key={i} content={part.content} />
              )
            )}
            {isStreaming && <StreamingDot />}
          </>
        ) : (
          <span className="text-text-muted italic">Thinking...</span>
        )}
      </div>
    </div>
  )
})
