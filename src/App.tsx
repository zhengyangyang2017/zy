import { AppShell } from './components/shell/AppShell'
import { SessionSidebar } from './components/panels/SessionSidebar'
import { MainPanel } from './components/panels/MainPanel'
import { BottomPanel } from './components/panels/BottomPanel'
import { SettingsPanel } from './components/panels/SettingsPanel'
import { FeedbackPanel } from './components/panels/FeedbackPanel'
import { ClusterDashboard } from './components/panels/ClusterDashboard'
import { CommandPalette } from './components/command/CommandPalette'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { usePanelStore } from './stores/panelStore'
import { useClusterStore } from './stores/clusterStore'
import { useKeyboard } from './hooks/useKeyboard'
import { useTheme } from './hooks/useTheme'

export default function App() {
  useTheme()
  useKeyboard()

  const {
    sidebarOpen, sidebarWidth,
    bottomPanelOpen, bottomPanelHeight,
    settingsOpen, toggleSettings,
    feedbackOpen, toggleFeedback,
    setSidebarWidth, setBottomPanelHeight,
  } = usePanelStore()

  const { dashboardOpen, setDashboardOpen } = useClusterStore()

  return (
    <ErrorBoundary name="AppRoot">
      <AppShell
        sidebar={
          <ErrorBoundary name="Sidebar">
            <SessionSidebar />
          </ErrorBoundary>
        }
        main={
          <ErrorBoundary name="MainPanel">
            <MainPanel />
          </ErrorBoundary>
        }
        bottomPanel={
          <ErrorBoundary name="BottomPanel">
            <BottomPanel />
          </ErrorBoundary>
        }
        sidebarWidth={sidebarOpen ? sidebarWidth : 0}
        bottomPanelOpen={bottomPanelOpen}
        bottomPanelHeight={bottomPanelHeight}
        onResizeSidebar={setSidebarWidth}
        onResizeBottomPanel={setBottomPanelHeight}
      />
      <ErrorBoundary name="CommandPalette">
        <CommandPalette />
      </ErrorBoundary>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%]">
          <div className="fixed inset-0 bg-black/40" onClick={toggleSettings} />
          <div className="relative w-[540px] h-[480px] bg-elevated rounded-2xl shadow-2xl border border-hover overflow-hidden">
            <ErrorBoundary name="SettingsPanel">
              <SettingsPanel onClose={toggleSettings} />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {feedbackOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%]">
          <div className="fixed inset-0 bg-black/40" onClick={toggleFeedback} />
          <div className="relative w-[480px] h-[380px] bg-elevated rounded-2xl shadow-2xl border border-hover overflow-hidden">
            <ErrorBoundary name="FeedbackPanel">
              <FeedbackPanel onClose={toggleFeedback} />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {dashboardOpen && <ClusterDashboard onClose={() => setDashboardOpen(false)} />}
    </ErrorBoundary>
  )
}
