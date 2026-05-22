import { useEffect, useState } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import type { Session } from '../../types'

export function SessionSidebar() {
  const { sessions, activeSessionId, setSessions, setActiveSession, addSession, removeSession } =
    useSessionStore()
  const messagesBySession = useChatStore((s) => s.messagesBySession)
  const setMessages = useChatStore((s) => s.setMessages)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  useEffect(() => {
    window.api.getSessions().then((backendSessions) => {
      if (backendSessions.length > 0) {
        setSessions(backendSessions)
        const firstId = backendSessions[0].id
        if (!activeSessionId && firstId) {
          setActiveSession(firstId)
          window.api.getMessages(firstId).then((msgs) => setMessages(firstId, msgs))
        }
      }
    })
  }, [])

  async function handleNewSession() {
    const session = await window.api.createSession('新会话')
    addSession(session)
  }

  function handleSelectSession(session: Session) {
    setActiveSession(session.id)
    // Only fetch from backend if not already loaded locally
    if (!messagesBySession[session.id]) {
      window.api.getMessages(session.id).then((msgs) => setMessages(session.id, msgs))
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await window.api.deleteSession(id)
    removeSession(id)
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center justify-between p-3 border-b border-hover">
        <span className="text-sm font-semibold text-text-primary">会话</span>
        <button
          onClick={handleNewSession}
          className="w-6 h-6 flex items-center justify-center bg-primary text-white rounded-md text-sm hover:opacity-80 transition-opacity"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <p className="text-xs text-text-muted text-center mt-8">
            还没有会话，点击 + 开始
          </p>
        )}
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => handleSelectSession(session)}
            onMouseEnter={() => setHoveredId(session.id)}
            onMouseLeave={() => setHoveredId(null)}
            className={`w-full text-left p-3 rounded-lg mb-1 transition-colors group relative ${
              session.id === activeSessionId
                ? 'bg-active border border-primary/30'
                : 'hover:bg-hover border border-transparent'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-primary truncate pr-4">{session.title}</span>
              <div className="flex items-center gap-1">
                {hoveredId === session.id && (
                  <span
                    onClick={(e) => handleDelete(e, session.id)}
                    className="text-xs text-text-muted hover:text-red-400 px-1 cursor-pointer"
                    title="删除会话"
                  >
                    ✕
                  </span>
                )}
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    session.status === 'active'
                      ? 'bg-green-500'
                      : session.status === 'background'
                        ? 'bg-yellow-500'
                        : 'bg-gray-600'
                  }`}
                />
              </div>
            </div>
            <p className="text-xs text-text-muted mt-1">
              {session.messageCount} messages
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
