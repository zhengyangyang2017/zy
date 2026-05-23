import { usePanelStore } from '../../stores/panelStore'
import { FilesPanel } from './FilesPanel'
import { TasksPanel } from './TasksPanel'
import { GitPanel } from './GitPanel'
import { ClusterPanel } from './ClusterPanel'

const TABS = [
  { key: 'files' as const, label: '📁 文件' },
  { key: 'tasks' as const, label: '📋 任务' },
  { key: 'git' as const, label: '🔀 Git' },
  { key: 'cluster' as const, label: '🖧 集群' },
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
      <div className="flex-1 overflow-hidden">
        {rightPanelTab === 'files' && <FilesPanel />}
        {rightPanelTab === 'tasks' && <TasksPanel />}
        {rightPanelTab === 'git' && <GitPanel />}
        {rightPanelTab === 'cluster' && <ClusterPanel />}
      </div>
    </div>
  )
}
