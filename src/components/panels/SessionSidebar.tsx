import { useEffect, useState, useRef, useCallback } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import type { Session } from '../../types'

export function SessionSidebar() {
  const { sessions, activeSessionId, setSessions, setActiveSession, addSession, removeSession, updateSession } =
    useSessionStore()
  const messagesBySession = useChatStore((s) => s.messagesBySession)
  const setMessages = useChatStore((s) => s.setMessages)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const editRef = useRef<HTMLInputElement>(null)

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

  const handleDoubleClick = useCallback((session: Session) => {
    setEditingId(session.id)
    setEditTitle(session.title)
    setTimeout(() => editRef.current?.focus(), 50)
  }, [])

  async function commitRename(id: string) {
    const title = editTitle.trim()
    if (title && title !== sessions.find(s => s.id === id)?.title) {
      await window.api.renameSession(id, title)
      updateSession(id, { title })
    }
    setEditingId(null)
    setEditTitle('')
  }

  function cancelRename() {
    setEditingId(null)
    setEditTitle('')
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
              {editingId === session.id ? (
                <input
                  ref={editRef}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(session.id)
                    if (e.key === 'Escape') cancelRename()
                  }}
                  onBlur={() => commitRename(session.id)}
                  className="flex-1 bg-elevated border border-primary rounded px-1 py-0.5 text-sm text-text-primary outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="text-sm text-text-primary truncate pr-4"
                  onDoubleClick={(e) => { e.stopPropagation(); handleDoubleClick(session) }}
                  title="双击重命名"
                >
                  {session.title}
                </span>
              )}
              <div className="flex items-center gap-1">
                {hoveredId === session.id && editingId !== session.id && (
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
              {session.messageCount} 条消息
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
