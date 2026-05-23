import { useState, useEffect, useCallback } from 'react'

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
      setError('无法加载配置')
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
      setError('保存失败')
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
        <span className="text-xs text-text-secondary font-medium">⚙️ 设置</span>
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
          <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-2">API 配置</h3>

          <label className="block mb-1.5">
            <span className="text-[10px] text-text-muted">API Key</span>
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
            <span className="text-[10px] text-text-muted">API Base URL</span>
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
            <span className="text-[10px] text-text-muted">模型</span>
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
          <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-2">外观</h3>

          <label className="block mb-1.5">
            <span className="text-[10px] text-text-muted">主题</span>
            <select
              value={config.theme}
              onChange={(e) => update('theme', e.target.value)}
              className="w-full bg-elevated border border-hover rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-primary mt-0.5"
            >
              <option value="dark">深色</option>
              <option value="light">浅色</option>
            </select>
          </label>

          <label className="block mb-1.5">
            <span className="text-[10px] text-text-muted">字号 ({config.fontSize}px)</span>
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
          <p className="font-medium text-text-secondary mb-1">常用配置参考</p>
          <p>DeepSeek:  https://api.deepseek.com | deepseek-v4-pro</p>
          <p>OpenAI:   https://api.openai.com | gpt-4o</p>
          <p>Anthropic: (key 以 sk-ant 开头自动识别) | claude-sonnet-4-6</p>
        </div>

        {/* Export */}
        <div>
          <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-2">数据导出</h3>
          <div className="space-y-1.5">
            <button
              onClick={async () => {
                try {
                  const result = await window.api.exportKnowledge()
                  const exportResult = result as { success: boolean; error?: string }
                  if (exportResult.success) setError(null)
                  else setError(exportResult.error || '导出失败')
                } catch (err) { setError('导出失败') }
              }}
              className="w-full text-left px-3 py-2 bg-elevated border border-hover rounded-lg text-xs text-text-secondary hover:text-text-primary hover:border-text-muted/50 transition-colors"
            >
              📦 导出知识图谱 (JSON)
            </button>
            <p className="text-[10px] text-text-muted px-1">
              会话导出请在会话列表中使用右键菜单
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
              🧪 生成测试数据 (~15,000行)
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
          配置保存在本地，不会上传
        </span>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-success">✓ 已保存</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {saving ? '⏳ 保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
