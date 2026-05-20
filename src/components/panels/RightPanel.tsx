import { usePanelStore } from '../../stores/panelStore'

const TABS = [
  { key: 'files' as const, label: '📁 文件' },
  { key: 'tasks' as const, label: '📋 任务' },
  { key: 'git' as const, label: '🔀 Git' }
]

export function RightPanel() {
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab)
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab)

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex border-b border-hover">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setRightPanelTab(tab.key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              rightPanelTab === tab.key
                ? 'text-primary border-b-2 border-primary'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <p className="text-xs text-text-muted text-center mt-8">
          {rightPanelTab === 'files' && '文件浏览器 (Phase 2)'}
          {rightPanelTab === 'tasks' && '任务面板 (Phase 3)'}
          {rightPanelTab === 'git' && 'Git 面板 (Phase 3)'}
        </p>
      </div>
    </div>
  )
}
