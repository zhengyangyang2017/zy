import { AppShell } from './components/shell/AppShell'
import { SessionSidebar } from './components/panels/SessionSidebar'
import { MainPanel } from './components/panels/MainPanel'
import { RightPanel } from './components/panels/RightPanel'
import { BottomPanel } from './components/panels/BottomPanel'
import { CommandPalette } from './components/command/CommandPalette'
import { usePanelStore } from './stores/panelStore'
import { useKeyboard } from './hooks/useKeyboard'
import { useTheme } from './hooks/useTheme'

export default function App() {
  useTheme()
  useKeyboard()

  const {
    sidebarOpen, sidebarWidth,
    rightPanelOpen, rightPanelWidth,
    bottomPanelOpen, bottomPanelHeight
  } = usePanelStore()

  return (
    <>
      <AppShell
        sidebar={<SessionSidebar />}
        main={<MainPanel />}
        rightPanel={<RightPanel />}
        bottomPanel={<BottomPanel />}
        sidebarWidth={sidebarOpen ? sidebarWidth : 0}
        rightPanelWidth={rightPanelWidth}
        rightPanelOpen={rightPanelOpen}
        bottomPanelOpen={bottomPanelOpen}
        bottomPanelHeight={bottomPanelHeight}
      />
      <CommandPalette />
    </>
  )
}
