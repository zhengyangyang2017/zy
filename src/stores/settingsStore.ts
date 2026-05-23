import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from '../types'

interface SettingsState {
  theme: Theme
  fontSize: number
  language: 'zh-CN' | 'en'
  toggleTheme: () => void
  setFontSize: (n: number) => void
  setLanguage: (lang: 'zh-CN' | 'en') => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      fontSize: 14,
      language: 'zh-CN',

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

      setFontSize: (n) => set({ fontSize: n }),
      setLanguage: (lang) => set({ language: lang }),
    }),
    { name: 'settings', version: 1 }
  )
)
