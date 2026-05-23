/**
 * Simple i18n system — no dependencies.
 *
 * Usage:
 *   import { useI18n } from '../i18n'
 *   const { t } = useI18n()
 *   t('sidebar.title') // → '会话' or 'Sessions'
 */

import { useSettingsStore } from '../stores/settingsStore'
import zhCN from './zh-CN'
import en from './en'
import type { Locale } from './zh-CN'

const locales: Record<string, Locale> = {
  'zh-CN': zhCN,
  'en': en,
}

/**
 * Translate a dotted key path to the current locale string.
 * Supports {placeholder} interpolation.
 */
function translate(locale: string, key: string, params?: Record<string, string | number>): string {
  const keys = key.split('.')
  let value: unknown = locales[locale] || zhCN

  for (const k of keys) {
    if (typeof value === 'object' && value !== null && k in value) {
      value = (value as Record<string, unknown>)[k]
    } else {
      // Fallback to zh-CN
      let fallback: unknown = zhCN
      for (const fk of keys) {
        fallback = typeof fallback === 'object' && fallback !== null && fk in fallback
          ? (fallback as Record<string, unknown>)[fk]
          : key
      }
      return String(fallback)
    }
  }

  let result = String(value ?? key)

  // Interpolate placeholders
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{${k}}`, String(v))
    }
  }

  return result
}

export function useI18n() {
  const language = useSettingsStore((s) => s.language) || 'zh-CN'

  return {
    t: (key: string, params?: Record<string, string | number>) => translate(language, key, params),
    language,
    locale: locales[language] || zhCN,
  }
}

/** Translate without hook (for use outside React components). */
export function getT(language: string = 'zh-CN') {
  return (key: string, params?: Record<string, string | number>) => translate(language, key, params)
}
