import { create } from 'zustand'
import type { ClusterState } from '../types'

interface ClusterStoreState {
  data: ClusterState | null
  dashboardOpen: boolean
  setData: (data: ClusterState) => void
  toggleDashboard: () => void
  setDashboardOpen: (open: boolean) => void
}

export const useClusterStore = create<ClusterStoreState>()((set) => ({
  data: null,
  dashboardOpen: false,
  setData: (data) => set({ data }),
  toggleDashboard: () => set((s) => ({ dashboardOpen: !s.dashboardOpen })),
  setDashboardOpen: (open) => set({ dashboardOpen: open }),
}))
