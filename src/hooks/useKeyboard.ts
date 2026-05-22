import { useEffect } from 'react'
import { usePanelStore } from '../stores/panelStore'

export function useKeyboard() {
  const toggleSidebar = usePanelStore((s) => s.toggleSidebar)
  const toggleRightPanelTab = usePanelStore((s) => s.toggleRightPanelTab)
  const toggleBottomPanel = usePanelStore((s) => s.toggleBottomPanel)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      switch (e.key) {
        case 'b':
          e.preventDefault()
          toggleSidebar()
          break
        case 'e':
          e.preventDefault()
          toggleRightPanelTab('files')
          break
        case 't':
          if (e.shiftKey) {
            e.preventDefault()
            toggleRightPanelTab('tasks')
          }
          break
        case '`':
          e.preventDefault()
          toggleBottomPanel()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar, toggleRightPanelTab, toggleBottomPanel])
}
