import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from '../types'

interface SettingsState {
  theme: Theme
  fontSize: number
  toggleTheme: () => void
  setFontSize: (n: number) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      fontSize: 14,

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      setFontSize: (n) => set({ fontSize: n })
    }),
    { name: 'settings' }
  )
)
