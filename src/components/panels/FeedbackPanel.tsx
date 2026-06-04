/**
 * In-app feedback and bug reporting panel.
 *
 * Collects:
 * - User message / bug description
 * - Optional diagnostic snapshot (OS, version, memory, recent crashes)
 * - Saves to crash_logs or sends via IPC
 */

import { useState, useEffect } from 'react'
import { useI18n } from '../../i18n'

interface Props {
  onClose: () => void
}

export function FeedbackPanel({ onClose }: Props) {
  const { t } = useI18n()
  const [message, setMessage] = useState('')
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!message.trim() || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const diag = includeDiagnostics
        ? `OS: ${navigator.platform} | UA: ${navigator.userAgent.slice(0, 100)} | Time: ${new Date().toISOString()}`
        : ''

      await window.api.submitFeedback(message.slice(0, 2000), diag)

      setDone(true)
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('feedback.error'))
    }
    setSubmitting(false)
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center justify-between px-3 py-2 border-b border-hover">
        <span className="text-xs text-text-secondary font-medium" role="heading" aria-level={2}>
          🐛 {t('feedback.title')}
        </span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary text-sm"
          aria-label={t('feedback.cancel')}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {done ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-2xl">✅</span>
            <p className="text-xs text-text-secondary">{t('feedback.thanks')}</p>
          </div>
        ) : (
          <>
            <label className="block" aria-label={t('feedback.title')}>
              <span className="text-[10px] text-text-muted">{t('feedback.description')}</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('feedback.placeholder')}
                rows={5}
                aria-label={t('feedback.description')}
                className="w-full bg-elevated border border-hover rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none focus:border-primary resize-none mt-1"
              />
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDiagnostics}
                onChange={(e) => setIncludeDiagnostics(e.target.checked)}
                className="accent-primary"
                aria-label={t('feedback.diagnostics')}
              />
              <span className="text-[10px] text-text-muted">
                {t('feedback.diagnostics')}
              </span>
            </label>

            {error && (
              <p className="text-xs text-error" role="alert">{error}</p>
            )}
          </>
        )}
      </div>

      {!done && (
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-hover">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            {t('feedback.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || submitting}
            className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            aria-label={t('feedback.submit')}
          >
            {submitting ? t('feedback.submitting') : t('feedback.submit')}
          </button>
        </div>
      )}
    </div>
  )
}
