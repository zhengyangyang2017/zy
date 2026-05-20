import type { Message } from '../../types'
import { CodeBlock } from './CodeBlock'

interface Props {
  message: Message
}

function renderContent(content: string) {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
  const parts: { type: 'text' | 'code'; content: string; language?: string }[] = []
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

  return parts.map((part, i) =>
    part.type === 'code' ? (
      <CodeBlock key={i} language={part.language} code={part.content} />
    ) : (
      <p key={i} className="whitespace-pre-wrap leading-relaxed">{part.content}</p>
    )
  )
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user'

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
            ? 'bg-green-900 text-gray-200'
            : 'bg-hover text-text-primary'
        }`}
      >
        {message.content ? renderContent(message.content) : (
          <span className="text-text-muted italic">Thinking...</span>
        )}
      </div>
    </div>
  )
}
