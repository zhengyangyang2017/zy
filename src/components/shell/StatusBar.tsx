import { usePanelStore } from '../../stores/panelStore'

export function StatusBar() {
  const toggleRightPanel = usePanelStore((s) => s.toggleRightPanel)
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab)
  const toggleBottomPanel = usePanelStore((s) => s.toggleBottomPanel)

  return (
    <div className="flex items-center h-7 bg-surface border-t border-hover px-3 text-xs text-text-muted gap-4">
      <button
        onClick={() => { setRightPanelTab('files'); toggleRightPanel() }}
        className="hover:text-text-secondary transition-colors"
      >
        📁 文件
      </button>
      <button
        onClick={() => { setRightPanelTab('tasks'); toggleRightPanel() }}
        className="hover:text-text-secondary transition-colors"
      >
        📋 任务
      </button>
      <button
        onClick={toggleBottomPanel}
        className="hover:text-text-secondary transition-colors"
      >
        📜 终端
      </button>
      <button
        onClick={() => { setRightPanelTab('git'); toggleRightPanel() }}
        className="hover:text-text-secondary transition-colors"
      >
        🔀 Git
      </button>
      <span className="ml-auto">1 active</span>
    </div>
  )
}
