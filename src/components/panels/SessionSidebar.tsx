import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useI18n } from '../../i18n'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import type { Session } from '../../types'

export function SessionSidebar() {
  const { t } = useI18n()
  const { sessions, activeSessionId, setSessions, setActiveSession, addSession, removeSession, updateSession } =
    useSessionStore()
  const messagesBySession = useChatStore((s) => s.messagesBySession)
  const setMessages = useChatStore((s) => s.setMessages)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [search, setSearch] = useState('')
  const editRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

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

  const filteredSessions = useMemo(() => {
    if (!search.trim()) return sessions
    const lower = search.toLowerCase()
    return sessions.filter(s => s.title.toLowerCase().includes(lower))
  }, [sessions, search])

  async function handleNewSession() {
    const session = await window.api.createSession(t('sidebar.newSession'))
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
        <span className="text-sm font-semibold text-text-primary">{t('sidebar.title')}</span>
        <button
          onClick={handleNewSession}
          className="w-6 h-6 flex items-center justify-center bg-primary text-white rounded-md text-sm hover:opacity-80 transition-opacity"
        >
          +
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-hover">
        <div className="relative">
          <input
            ref={searchRef}
            type="text"
            placeholder={t('sidebar.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-hover text-xs text-text-primary placeholder-text-muted rounded-md px-2 py-1.5 pr-6 outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); searchRef.current?.focus() }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs"
            >
              ✕
            </button>
          )}
        </div>
        {search && (
          <p className="text-[10px] text-text-muted mt-0.5 px-0.5">
            {t('sidebar.searchResults', { filtered: filteredSessions.length, total: sessions.length })}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center px-4 mt-12">
            <p className="text-3xl mb-3">💬</p>
            <p className="text-xs text-text-secondary mb-1">还没有会话</p>
            <p className="text-[10px] text-text-muted mb-4">点击右上角 + 开始对话</p>
            <button
              onClick={handleNewSession}
              className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
            >
              创建第一个会话
            </button>
          </div>
        )}
        {sessions.length > 0 && filteredSessions.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center px-4 mt-12">
            <p className="text-2xl mb-2">🔍</p>
            <p className="text-xs text-text-secondary">{t('sidebar.noMatch')}</p>
          </div>
        )}
        {filteredSessions.map((session) => (
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
                  title={t('sidebar.rename')}
                >
                  {session.title}
                </span>
              )}
              <div className="flex items-center gap-1">
                {hoveredId === session.id && editingId !== session.id && (
                  <span
                    onClick={(e) => handleDelete(e, session.id)}
                    className="text-xs text-text-muted hover:text-red-400 px-1 cursor-pointer"
                    title={t('sidebar.delete')}
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
              {t('sidebar.messages', { count: session.messageCount })}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
