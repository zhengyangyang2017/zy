import { useState, useEffect, useRef, useCallback } from 'react'
import { usePanelStore } from '../../stores/panelStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useSessionStore } from '../../stores/sessionStore'

interface Command {
  id: string
  label: string
  shortcut?: string
  action: () => void
}

interface SearchResult {
  id: string
  sessionId: string
  sessionTitle: string
  role: string
  content: string
  createdAt: string
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  const { toggleSidebar, toggleRightPanelTab, toggleBottomPanel, toggleSettings, toggleFeedback } = usePanelStore()
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  const isMac = navigator.platform.toLowerCase().includes('mac')
  const mod = isMac ? '⌘' : 'Ctrl+'
  const shift = isMac ? '⇧' : 'Shift+'

  const commands: Command[] = [
    { id: 'sidebar', label: '切换侧边栏', shortcut: `${mod}B`, action: toggleSidebar },
    { id: 'files', label: '文件浏览器', shortcut: `${mod}${shift}E`, action: () => toggleRightPanelTab('files') },
    { id: 'tasks', label: '任务面板', shortcut: `${mod}${shift}T`, action: () => toggleRightPanelTab('tasks') },
    { id: 'terminal', label: '终端', shortcut: `${mod}\``, action: toggleBottomPanel },
    { id: 'settings', label: '设置', shortcut: `${mod},`, action: toggleSettings },
    { id: 'feedback', label: '反馈与报错', action: toggleFeedback },
    { id: 'theme', label: '切换主题', action: toggleTheme },
  ]

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  )

  // Debounced message search
  useEffect(() => {
    if (query.length < 2) { setSearchResults([]); return }
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await window.api.searchMessages(query)
        setSearchResults(results as SearchResult[])
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setSearchResults([])
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const executeCommand = useCallback(
    (cmd: Command) => {
      cmd.action()
      setIsOpen(false)
    },
    []
  )

  const openSearchResult = (result: SearchResult) => {
    setActiveSession(result.sessionId)
    setIsOpen(false)
  }

  const totalItems = filtered.length + (searchResults.length > 0 ? searchResults.length + 1 : 0)

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex < filtered.length) {
        executeCommand(filtered[selectedIndex])
      } else {
        const resultIdx = selectedIndex - filtered.length - 1
        if (searchResults[resultIdx]) openSearchResult(searchResults[resultIdx])
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%]">
      <div className="fixed inset-0 bg-black/40" onClick={() => setIsOpen(false)} />
      <div className="relative w-[580px] max-h-[480px] bg-elevated rounded-2xl shadow-2xl border border-hover overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-hover">
          <span className="text-text-muted">▸</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="搜索命令或消息..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none"
          />
        </div>
        <div className="max-h-[400px] overflow-y-auto p-2">
          {/* Commands */}
          {filtered.length > 0 && (
            <>
              <p className="text-[10px] text-text-muted px-3 py-1 uppercase tracking-wider">命令</p>
              {filtered.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onClick={() => executeCommand(cmd)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    i === selectedIndex ? 'bg-active text-text-primary' : 'text-text-secondary hover:bg-hover'
                  }`}
                >
                  <span>{cmd.label}</span>
                  {cmd.shortcut && <span className="text-xs text-text-muted">{cmd.shortcut}</span>}
                </button>
              ))}
            </>
          )}

          {/* Message search results */}
          {searchResults.length > 0 && (
            <>
              <p className="text-[10px] text-text-muted px-3 py-1 mt-2 uppercase tracking-wider">
                消息 ({searchResults.length})
              </p>
              {searchResults.map((r, i) => {
                const idx = filtered.length + 1 + i
                return (
                  <button
                    key={r.id}
                    onClick={() => openSearchResult(r)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                      idx === selectedIndex ? 'bg-active text-text-primary' : 'text-text-secondary hover:bg-hover'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-text-muted">{r.role === 'user' ? '👤' : '🤖'}</span>
                      <span className="text-text-muted text-[10px]">{r.sessionTitle}</span>
                    </div>
                    <span className="text-text-secondary line-clamp-2">{r.content}</span>
                  </button>
                )
              })}
            </>
          )}

          {/* Searching indicator */}
          {searching && (
            <p className="text-xs text-text-muted text-center py-3">搜索中...</p>
          )}

          {/* Empty state */}
          {filtered.length === 0 && searchResults.length === 0 && !searching && query.length > 0 && (
            <p className="text-sm text-text-muted text-center py-6">无匹配结果</p>
          )}
          {filtered.length === 0 && query.length === 0 && (
            <p className="text-sm text-text-muted text-center py-6">输入关键词搜索命令或消息</p>
          )}
        </div>
      </div>
    </div>
  )
}
