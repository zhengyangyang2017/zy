import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PanelLayout } from '../types'

interface PanelState extends PanelLayout {
  toggleSidebar: () => void
  toggleBottomPanel: () => void
  toggleSettings: () => void
  toggleFeedback: () => void
  setSidebarWidth: (w: number) => void
  setBottomPanelHeight: (h: number) => void
}

export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarWidth: 240,
      bottomPanelOpen: false,
      bottomPanelHeight: 200,
      settingsOpen: false,
      feedbackOpen: false,

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleBottomPanel: () => set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),
      toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
      toggleFeedback: () => set((s) => ({ feedbackOpen: !s.feedbackOpen })),
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      setBottomPanelHeight: (h) => set({ bottomPanelHeight: h }),
    }),
    { name: 'panel-layout', version: 2 }
  )
)
