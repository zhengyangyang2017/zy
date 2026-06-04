import { useMemo } from 'react'
import hljs from 'highlight.js'

export function useHighlight(code: string, language?: string) {
  return useMemo(() => {
    if (!code) return { html: '', detectedLanguage: undefined }

    try {
      if (language && hljs.getLanguage(language)) {
        const result = hljs.highlight(code, { language })
        return { html: result.value, detectedLanguage: language }
      }
      const result = hljs.highlightAuto(code)
      return { html: result.value, detectedLanguage: result.language || undefined }
    } catch {
      const result = hljs.highlightAuto(code)
      return { html: result.value, detectedLanguage: result.language || undefined }
    }
  }, [code, language])
}
