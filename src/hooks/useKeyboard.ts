import { useEffect } from 'react'
import { usePanelStore } from '../stores/panelStore'
import { useSessionStore } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'

export function useKeyboard() {
  const toggleSidebar = usePanelStore((s) => s.toggleSidebar)
  const toggleRightPanelTab = usePanelStore((s) => s.toggleRightPanelTab)
  const toggleBottomPanel = usePanelStore((s) => s.toggleBottomPanel)

  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const messagesBySession = useChatStore((s) => s.messagesBySession)
  const setMessages = useChatStore((s) => s.setMessages)

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
        case 'Tab': {
          e.preventDefault()
          if (sessions.length < 2) return
          const currentIdx = sessions.findIndex(s => s.id === activeSessionId)
          const nextIdx = e.shiftKey
            ? (currentIdx <= 0 ? sessions.length - 1 : currentIdx - 1)
            : (currentIdx >= sessions.length - 1 ? 0 : currentIdx + 1)
          const nextSession = sessions[nextIdx]
          if (nextSession) {
            setActiveSession(nextSession.id)
            if (!messagesBySession[nextSession.id]) {
              window.api.getMessages(nextSession.id).then((msgs) => setMessages(nextSession.id, msgs))
            }
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar, toggleRightPanelTab, toggleBottomPanel, sessions, activeSessionId, setActiveSession, messagesBySession, setMessages])
}
