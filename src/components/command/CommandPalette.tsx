import { useState, useEffect, useRef, useCallback } from 'react'
import { usePanelStore } from '../../stores/panelStore'
import { useSettingsStore } from '../../stores/settingsStore'

interface Command {
  id: string
  label: string
  shortcut?: string
  action: () => void
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const { toggleSidebar, toggleRightPanelTab, toggleBottomPanel } = usePanelStore()
  const toggleTheme = useSettingsStore((s) => s.toggleTheme)

  const isMac = navigator.platform.toLowerCase().includes('mac')
  const mod = isMac ? '⌘' : 'Ctrl+'
  const shift = isMac ? '⇧' : 'Shift+'

  const commands: Command[] = [
    { id: 'sidebar', label: '切换侧边栏', shortcut: `${mod}B`, action: toggleSidebar },
    { id: 'files', label: '文件浏览器', shortcut: `${mod}${shift}E`, action: () => toggleRightPanelTab('files') },
    { id: 'tasks', label: '任务面板', shortcut: `${mod}${shift}T`, action: () => toggleRightPanelTab('tasks') },
    { id: 'terminal', label: '终端', shortcut: `${mod}\``, action: toggleBottomPanel },
    { id: 'theme', label: '切换主题', action: toggleTheme }
  ]

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  )

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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      executeCommand(filtered[selectedIndex])
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20%]">
      <div className="fixed inset-0 bg-black/40" onClick={() => setIsOpen(false)} />
      <div className="relative w-[560px] max-h-80 bg-elevated rounded-2xl shadow-2xl border border-hover overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-hover">
          <span className="text-text-muted">▸</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="搜索命令..."
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted focus:outline-none"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="text-sm text-text-muted text-center py-6">无匹配命令</p>
          )}
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
        </div>
      </div>
    </div>
  )
}
