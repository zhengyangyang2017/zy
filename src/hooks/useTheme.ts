import { useEffect } from 'react'
import { useSettingsStore } from '../stores/settingsStore'

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(theme)
  }, [theme])

  return theme
}
