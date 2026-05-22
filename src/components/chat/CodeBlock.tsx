import { useState } from 'react'

interface Props {
  language?: string
  code: string
}

export function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await window.api.copyToClipboard(code)
    } catch {
      navigator.clipboard.writeText(code)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-hover bg-surface">
      <div className="flex items-center justify-between px-3 py-1.5 bg-hover">
        <span className="text-xs text-text-muted">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto select-text">
        <code className="text-sm font-mono text-text-primary whitespace-pre select-text">
          {code}
        </code>
      </pre>
    </div>
  )
}
