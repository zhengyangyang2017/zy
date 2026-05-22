import { usePanelStore } from '../../stores/panelStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useEffect, useState } from 'react'

const BUTTONS = [
  { key: 'files' as const,  label: '文件', icon: '📁', hint: '项目文件' },
  { key: 'tasks' as const,  label: '任务', icon: '📋', hint: 'AI 研究任务' },
  { key: 'git' as const,    label: 'Git',  icon: '🔀', hint: '版本控制' },
]

export function StatusBar() {
  const toggleRightPanelTab = usePanelStore((s) => s.toggleRightPanelTab)
  const panelStore = usePanelStore()
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const [nodeCount, setNodeCount] = useState(0)

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
        title="终端"
        className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
          panelStore.bottomPanelOpen
            ? 'bg-active text-primary'
            : 'text-text-muted hover:text-text-secondary hover:bg-hover'
        }`}
      >
        <span className="text-sm leading-none">💻</span>
        <span className="text-[10px]">终端</span>
      </button>

      <div className="flex-1" />

      {/* Right side info */}
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
