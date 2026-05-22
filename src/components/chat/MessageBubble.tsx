import { useMemo } from 'react'
import type { Message } from '../../types'
import { Marked } from 'marked'
import { CodeBlock } from './CodeBlock'

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

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'
  const parts = parseContent(message.content || '')

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
          isUser ? 'bg-gray-600 text-gray-300' : 'bg-primary text-white'
        }`}
      >
        {isUser ? 'Y' : '🤖'}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
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
      </div>
    </div>
  )
}
