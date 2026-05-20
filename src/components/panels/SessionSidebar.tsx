import { useEffect } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import type { Session } from '../../types'

export function SessionSidebar() {
  const { sessions, activeSessionId, setSessions, setActiveSession, addSession } =
    useSessionStore()
  const setMessages = useChatStore((s) => s.setMessages)

  useEffect(() => {
    window.api.getSessions().then(setSessions)
  }, [])

  async function handleNewSession() {
    const session: Session = {
      id: `session_${Date.now()}`,
      title: '新会话',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      status: 'active'
    }
    addSession(session)
  }

  function handleSelectSession(session: Session) {
    setActiveSession(session.id)
    window.api.getMessages(session.id).then((msgs) => setMessages(session.id, msgs))
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center justify-between p-3 border-b border-hover">
        <span className="text-sm font-semibold text-text-primary">💬 会话</span>
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
            className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${
              session.id === activeSessionId
                ? 'bg-active border border-primary/30'
                : 'hover:bg-hover border border-transparent'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-primary truncate">{session.title}</span>
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
            <p className="text-xs text-text-muted mt-1">
              {session.messageCount} messages
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
