import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useI18n } from '../../i18n'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import { useToastStore } from '../../stores/toastStore'
import { SessionContextMenu } from './SessionContextMenu'
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

  // Phase 2 state
  const [contextMenu, setContextMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [editingTags, setEditingTags] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [searchResults, setSearchResults] = useState<Session[] | null>(null)
  const [searching, setSearching] = useState(false)

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

  // Content search (debounced, triggers for queries >= 3 chars)
  useEffect(() => {
    if (!search.trim() || search.trim().length < 3) {
      setSearchResults(null)
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await window.api.searchSessions(search)
        setSearchResults(results)
      } catch { setSearchResults(null) }
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Collect all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>()
    sessions.forEach(s => s.tags?.forEach(t => set.add(t)))
    return Array.from(set).sort()
  }, [sessions])

  // Filtered and sorted sessions
  const filteredSessions = useMemo(() => {
    const source = search.trim().length >= 3 && searchResults ? searchResults : sessions
    let result = source
    if (tagFilter) {
      result = result.filter(s => s.tags?.includes(tagFilter))
    }
    if (search.trim() && search.trim().length < 3) {
      const lower = search.toLowerCase()
      result = result.filter(s => s.title.toLowerCase().includes(lower))
    }
    // Pinned first
    return [...result].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
  }, [sessions, search, tagFilter, searchResults])

  async function handleNewSession() {
    const session = await window.api.createSession(t('sidebar.newSession'))
    addSession(session)
  }

  function handleSelectSession(session: Session) {
    setActiveSession(session.id)
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

  // Phase 2 handlers
  async function handleTogglePin(sessionId: string) {
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return
    const newPinned = !session.pinned
    useSessionStore.getState().togglePin(sessionId)
    try { await window.api.updateSession(sessionId, { pinned: newPinned }) } catch {}
  }

  async function handleSaveTags(sessionId: string, tags: string[]) {
    useSessionStore.getState().setTags(sessionId, tags)
    try { await window.api.updateSession(sessionId, { tags }) } catch {}
  }

  function handleContextMenu(e: React.MouseEvent, sessionId: string) {
    e.preventDefault()
    setContextMenu({ sessionId, x: e.clientX, y: e.clientY })
  }

  async function handleExport(sessionId: string, format: 'md' | 'json') {
    try {
      const result = await window.api.exportSession(sessionId, format)
      if (result?.success) {
        const filename = result.path?.split(/[/\\]/).pop() || '文件'
        useToastStore.getState().addToast(`✅ 已导出到 ${filename}`, 'success')
      } else {
        useToastStore.getState().addToast(result?.error || '导出失败', 'error')
      }
    } catch {
      useToastStore.getState().addToast('导出失败', 'error')
    }
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
        {searching && (
          <p className="text-[10px] text-text-muted mt-0.5 px-0.5">搜索中...</p>
        )}
        {search && !searching && (
          <p className="text-[10px] text-text-muted mt-0.5 px-0.5">
            {t('sidebar.searchResults', { filtered: filteredSessions.length, total: sessions.length })}
          </p>
        )}
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && !search && (
        <div className="px-2 py-1 border-b border-hover flex flex-wrap gap-1">
          <button
            onClick={() => setTagFilter(null)}
            className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
              !tagFilter ? 'bg-primary text-white' : 'bg-hover text-text-muted hover:text-text-secondary'
            }`}
          >
            全部
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
                tagFilter === tag ? 'bg-primary text-white' : 'bg-hover text-text-muted hover:text-text-secondary'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

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
            onContextMenu={(e) => handleContextMenu(e, session.id)}
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
                  {session.pinned && <span className="text-yellow-400 mr-1" title="已置顶">📌</span>}
                  {session.parentSessionId && <span className="text-text-muted mr-1" title="分支对话">🌿</span>}
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
              💬 {t('sidebar.messages', { count: session.messageCount })}
              {session.updatedAt && ` · ${new Date(session.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`}
            </p>
            {session.tags && session.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {session.tags.map(tag => (
                  <span key={tag} className="px-1 py-0.5 bg-hover rounded text-[9px] text-text-muted">{tag}</span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <SessionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: sessions.find(s => s.id === contextMenu.sessionId)?.pinned ? '取消置顶' : '📌 置顶',
              icon: '📌',
              action: () => handleTogglePin(contextMenu.sessionId),
            },
            {
              label: '🏷️ 编辑标签',
              icon: '🏷️',
              action: () => {
                const session = sessions.find(s => s.id === contextMenu.sessionId)
                setTagInput(session?.tags?.join(', ') || '')
                setEditingTags(contextMenu.sessionId)
              },
            },
            {
              label: '📤 导出 Markdown',
              icon: '📝',
              action: () => handleExport(contextMenu.sessionId, 'md'),
            },
            {
              label: '📤 导出 JSON',
              icon: '📋',
              action: () => handleExport(contextMenu.sessionId, 'json'),
            },
            { separator: true, label: '', icon: '', action: () => {} },
            {
              label: '🗑️ 删除会话',
              icon: '🗑️',
              action: () => {
                window.api.deleteSession(contextMenu.sessionId)
                useSessionStore.getState().removeSession(contextMenu.sessionId)
              },
              danger: true,
            },
          ]}
        />
      )}

      {/* Tag editor modal */}
      {editingTags && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setEditingTags(null)} />
          <div className="relative bg-surface rounded-xl shadow-2xl border border-hover p-4 w-[320px] animate-scaleIn">
            <h4 className="text-xs font-semibold text-text-primary mb-3">编辑标签</h4>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
                  handleSaveTags(editingTags, tags)
                  setEditingTags(null)
                  setTagInput('')
                }
                if (e.key === 'Escape') { setEditingTags(null); setTagInput('') }
              }}
              placeholder="react, api, debug (逗号分隔)"
              className="w-full bg-elevated border border-hover rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none focus:border-primary mb-3"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEditingTags(null); setTagInput('') }}
                className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary rounded-lg transition-colors">
                取消
              </button>
              <button onClick={() => {
                const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
                handleSaveTags(editingTags, tags)
                setEditingTags(null)
                setTagInput('')
              }}
                className="px-3 py-1.5 bg-primary text-white text-xs rounded-lg hover:opacity-90 transition-opacity">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
