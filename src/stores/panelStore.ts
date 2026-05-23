import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PanelLayout, PanelTab } from '../types'

interface PanelState extends PanelLayout {
  settingsOpen: boolean
  feedbackOpen: boolean
  toggleSidebar: () => void
  toggleRightPanel: () => void
  toggleBottomPanel: () => void
  toggleSettings: () => void
  toggleFeedback: () => void
  setRightPanelTab: (tab: PanelTab) => void
  toggleRightPanelTab: (tab: PanelTab) => void
  setSidebarWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
  setBottomPanelHeight: (h: number) => void
}

export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarWidth: 240,
      rightPanelOpen: false,
      rightPanelWidth: 280,
      rightPanelTab: 'files',
      bottomPanelOpen: false,
      bottomPanelHeight: 200,
      settingsOpen: false,
      feedbackOpen: false,

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      toggleBottomPanel: () => set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),
      toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
      toggleFeedback: () => set((s) => ({ feedbackOpen: !s.feedbackOpen })),
      setRightPanelTab: (tab) => set({ rightPanelOpen: true, rightPanelTab: tab }),
      toggleRightPanelTab: (tab) => set((s) => ({
        rightPanelOpen: s.rightPanelOpen && s.rightPanelTab === tab ? false : true,
        rightPanelTab: tab
      })),
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      setRightPanelWidth: (w) => set({ rightPanelWidth: w }),
      setBottomPanelHeight: (h) => set({ bottomPanelHeight: h })
    }),
    { name: 'panel-layout' }
  )
)
