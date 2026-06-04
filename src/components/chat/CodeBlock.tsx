import { useState } from 'react'
import { useHighlight } from '../../hooks/useHighlight'
import { useI18n } from '../../i18n'

interface Props {
  language?: string
  code: string
}

export function CodeBlock({ language, code }: Props) {
  const [copied, setCopied] = useState(false)
  const { html, detectedLanguage } = useHighlight(code, language)
  const { t } = useI18n()

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
    <div className="my-3 rounded-xl overflow-hidden border border-hover bg-[#22272e]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d333b]">
        <span className="text-xs text-[#adbac7]">{detectedLanguage || language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-[#768390] hover:text-[#adbac7] transition-colors"
        >
          {copied ? t('codeBlock.copied') : t('codeBlock.copy')}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto select-text">
        <code
          className="text-sm font-mono whitespace-pre select-text hljs"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  )
}
