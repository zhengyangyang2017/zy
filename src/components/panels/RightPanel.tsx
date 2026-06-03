import { useI18n } from '../../i18n'
import { usePanelStore } from '../../stores/panelStore'
import { FilesPanel } from './FilesPanel'
import { TasksPanel } from './TasksPanel'
import { GitPanel } from './GitPanel'
import { ClusterPanel } from './ClusterPanel'

const PANELS = {
  files: FilesPanel,
  tasks: TasksPanel,
  git: GitPanel,
  cluster: ClusterPanel,
}

export function RightPanel() {
  const { t } = useI18n()
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab)

  const TABS = [
    { key: 'files' as const, label: t('panels.files') },
    { key: 'tasks' as const, label: t('panels.tasks') },
    { key: 'git' as const, label: t('panels.git') },
    { key: 'cluster' as const, label: t('panels.cluster') },
  ]
  const setRightPanelTab = usePanelStore((s) => s.setRightPanelTab)

  const ActivePanel = PANELS[rightPanelTab]

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
        <ActivePanel />
      </div>
    </div>
  )
}
