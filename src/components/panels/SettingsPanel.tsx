import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../i18n'
import { useSettingsStore } from '../../stores/settingsStore'

interface AppConfig {
  apiKey: string
  baseUrl: string
  model: string
  theme: 'dark' | 'light'
  fontSize: number
}

interface Props {
  onClose: () => void
}

export function SettingsPanel({ onClose }: Props) {
  const { t } = useI18n()
  const { language, setLanguage } = useSettingsStore()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    window.api.loadConfig().then((cfg) => {
      setConfig(cfg as AppConfig)
      setLoading(false)
    }).catch((err) => {
      console.error('[SettingsPanel] Failed to load config:', err)
      setError(t('settings.loadError'))
      setLoading(false)
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (!config) return
    setSaving(true)
    setError(null)
    try {
      await window.api.saveConfig(config as unknown as Record<string, unknown>)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('[SettingsPanel] Failed to save config:', err)
      setError(t('settings.saveError'))
    }
    setSaving(false)
  }, [config])

  const update = (key: keyof AppConfig, value: string | number) => {
    setConfig(prev => prev ? { ...prev, [key]: value } : prev)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-xs">
        ⏳ 加载配置...
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-hover">
        <span className="text-xs text-text-secondary font-medium">⚙️ {t('settings.title')}</span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary text-sm"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* API Section */}
        <div>
          <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('settings.apiConfig')}</h3>

          <label className="block mb-1.5">
            <span className="text-[10px] text-text-muted">{t('settings.apiKey')}</span>
            <div className="flex items-center gap-1 mt-0.5">
              <input
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => update('apiKey', e.target.value)}
                placeholder="sk-..."
                className="flex-1 bg-elevated border border-hover rounded px-2 py-1 text-xs text-text-primary placeholder-text-muted outline-none focus:border-primary"
                spellCheck={false}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-xs text-text-muted hover:text-text-primary px-1 flex-shrink-0"
              >
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
          </label>

          <label className="block mb-1.5">
            <span className="text-[10px] text-text-muted">{t('settings.apiBaseUrl')}</span>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => update('baseUrl', e.target.value)}
              placeholder="https://api.deepseek.com"
              className="w-full bg-elevated border border-hover rounded px-2 py-1 text-xs text-text-primary placeholder-text-muted outline-none focus:border-primary mt-0.5"
              spellCheck={false}
            />
          </label>

          <label className="block mb-1.5">
            <span className="text-[10px] text-text-muted">{t('settings.model')}</span>
            <input
              type="text"
              value={config.model}
              onChange={(e) => update('model', e.target.value)}
              placeholder="deepseek-v4-pro"
              className="w-full bg-elevated border border-hover rounded px-2 py-1 text-xs text-text-primary placeholder-text-muted outline-none focus:border-primary mt-0.5"
              spellCheck={false}
            />
          </label>
        </div>

        {/* Appearance */}
        <div>
          <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('settings.appearance')}</h3>

          <label className="block mb-1.5">
            <span className="text-[10px] text-text-muted">{t('settings.theme')}</span>
            <select
              value={config.theme}
              onChange={(e) => update('theme', e.target.value)}
              className="w-full bg-elevated border border-hover rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-primary mt-0.5"
            >
              <option value="dark">{t('settings.dark')}</option>
              <option value="light">{t('settings.light')}</option>
            </select>
          </label>

          <label className="block mb-1.5">
            <span className="text-[10px] text-text-muted">{t('settings.language')}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'zh-CN' | 'en')}
              className="w-full bg-elevated border border-hover rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-primary mt-0.5"
            >
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="block mb-1.5">
            <span className="text-[10px] text-text-muted">{t('settings.fontSize')} ({config.fontSize}px)</span>
            <input
              type="range"
              min="12"
              max="20"
              step="1"
              value={config.fontSize}
              onChange={(e) => update('fontSize', parseInt(e.target.value))}
              className="w-full mt-0.5 accent-primary"
            />
          </label>
        </div>

        {/* Provider hints */}
        <div className="text-[10px] text-text-muted space-y-1 bg-elevated rounded-lg p-2 border border-hover/50">
          <p className="font-medium text-text-secondary mb-1">{t('settings.configRef')}</p>
          <p>DeepSeek:  https://api.deepseek.com | deepseek-v4-pro</p>
          <p>OpenAI:   https://api.openai.com | gpt-4o</p>
          <p>Anthropic: (key 以 sk-ant 开头自动识别) | claude-sonnet-4-6</p>
        </div>

        {/* Export */}
        <div>
          <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-2">{t('settings.export')}</h3>
          <div className="space-y-1.5">
            <button
              onClick={async () => {
                try {
                  const result = await window.api.exportKnowledge()
                  const exportResult = result as { success: boolean; error?: string }
                  if (exportResult.success) setError(null)
                  else setError(exportResult.error || t('export.failed'))
                } catch (err) { setError(t('export.failed')) }
              }}
              className="w-full text-left px-3 py-2 bg-elevated border border-hover rounded-lg text-xs text-text-secondary hover:text-text-primary hover:border-text-muted/50 transition-colors"
            >
              📦 {t('settings.exportKnowledge')}
            </button>
            <p className="text-[10px] text-text-muted px-1">
              {t('settings.exportHint')}
            </p>
            <button
              onClick={async () => {
                try {
                  setSaving(true)
                  const result = await window.api.generateSeedData()
                  setSaved(true)
                  setTimeout(() => setSaved(false), 2000)
                } catch (err) {
                  setError('生成失败')
                }
                setSaving(false)
              }}
              className="w-full text-left px-3 py-2 bg-elevated border border-hover rounded-lg text-xs text-text-secondary hover:text-text-primary hover:border-text-muted/50 transition-colors"
            >
              🧪 {t('settings.seedData')}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-2 rounded-lg bg-red-900/30 border border-red-800 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-hover">
        <span className="text-[10px] text-text-muted">
          {t('settings.localOnly')}
        </span>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-success">✓ {t('settings.saved')}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {saving ? '⏳ ' + t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
