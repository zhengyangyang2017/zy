import { useI18n } from '../../i18n'
import { usePanelStore } from '../../stores/panelStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useEffect, useState } from 'react'
import type { LicenseStatus } from '../../types/license'

export function StatusBar() {
  const { t } = useI18n()
  const toggleRightPanelTab = usePanelStore((s) => s.toggleRightPanelTab)

  const BUTTONS = [
    { key: 'files' as const,  label: t('statusBar.files'), icon: '📁', hint: t('statusBar.files') },
    { key: 'tasks' as const,  label: t('statusBar.tasks'), icon: '📋', hint: t('statusBar.tasks') },
    { key: 'git' as const,    label: t('statusBar.git'),  icon: '🔀', hint: t('statusBar.git') },
  ]
  const panelStore = usePanelStore()
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const [nodeCount, setNodeCount] = useState(0)
  const [license, setLicense] = useState<LicenseStatus | null>(null)

  // Poll knowledge stats
  useEffect(() => {
    const poll = () => {
      window.api.getKnowledgeStats().then((s: { nodeCount: number }) => {
        setNodeCount(s.nodeCount)
      }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 15000)
    return () => clearInterval(interval)
  }, [])

  // Poll license status
  useEffect(() => {
    const poll = () => {
      window.api.getLicenseStatus().then(setLicense).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center h-7 bg-surface border-t border-hover px-2 text-xs gap-1">
      {/* Panel toggle buttons */}
      {BUTTONS.map((btn) => (
        <button
          key={btn.key}
          onClick={() => toggleRightPanelTab(btn.key)}
          title={btn.hint}
          className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
            panelStore.rightPanelOpen && panelStore.rightPanelTab === btn.key
              ? 'bg-active text-primary'
              : 'text-text-muted hover:text-text-secondary hover:bg-hover'
          }`}
        >
          <span className="text-sm leading-none">{btn.icon}</span>
          <span className="text-[10px]">{btn.label}</span>
        </button>
      ))}

      <div className="w-px h-3 bg-hover mx-1" />

      {/* Terminal toggle */}
      <button
        onClick={usePanelStore.getState().toggleBottomPanel}
        title={t('statusBar.terminal')}
        className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
          panelStore.bottomPanelOpen
            ? 'bg-active text-primary'
            : 'text-text-muted hover:text-text-secondary hover:bg-hover'
        }`}
      >
        <span className="text-sm leading-none">💻</span>
        <span className="text-[10px]">{t('statusBar.terminal')}</span>
      </button>

      <div className="flex-1" />

      {/* Right side info */}
      {license && (
        <span className={`text-[10px] flex items-center gap-1 ml-3 px-1.5 py-0.5 rounded ${
          license.tier === 'pro' || license.tier === 'enterprise'
            ? 'bg-purple-500/20 text-purple-300'
            : 'bg-text-muted/20 text-text-muted'
        }`}>
          {license.trial ? '🧪 试用中' : license.tier === 'pro' ? '⭐ Pro' : license.tier === 'enterprise' ? '🏢 企业' : '免费版'}
        </span>
      )}
      {activeSessionId && (
        <span className="text-[10px] text-text-muted flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-success" />
          已连接
        </span>
      )}
      {nodeCount > 0 && (
        <span className="text-[10px] text-text-muted flex items-center gap-1 ml-3">
          🧠 {nodeCount} 知识点
        </span>
      )}
    </div>
  )
}
