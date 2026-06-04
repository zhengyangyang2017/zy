import { useEffect, useState, useRef, useCallback } from 'react'

const FILE_ICONS: Record<string, string> = {
  '.ts': '🔷', '.tsx': '⚛️', '.js': '🟨', '.jsx': '⚛️',
  '.json': '📋', '.css': '🎨', '.scss': '🎨', '.html': '🌐',
  '.md': '📝', '.py': '🐍', '.go': '🔵', '.rs': '🦀',
  '.yml': '⚙️', '.yaml': '⚙️', '.toml': '⚙️',
}

function getFileIcon(filename: string): string {
  if (filename.endsWith('/')) return '📁'
  for (const [ext, icon] of Object.entries(FILE_ICONS)) {
    if (filename.endsWith(ext)) return icon
  }
  return '📄'
}

interface Props {
  isOpen: boolean
  query: string
  onSelect: (filePath: string) => void
  onClose: () => void
}

export function FileMentionDropdown({ isOpen, query, onSelect, onClose }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const selectedRef = useRef(0)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || !query) { setFiles([]); return }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const results = await window.api.searchFiles(query)
        setFiles(results)
      } catch { setFiles([]) }
      setLoading(false)
    }, 150)
    return () => clearTimeout(timer)
  }, [isOpen, query])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); selectedRef.current = Math.min(selectedRef.current + 1, files.length - 1); break
      case 'ArrowUp': e.preventDefault(); selectedRef.current = Math.max(selectedRef.current - 1, 0); break
      case 'Enter': e.preventDefault(); if (files[selectedRef.current]) onSelect(files[selectedRef.current]); break
      case 'Escape': e.preventDefault(); onClose(); break
    }
  }, [isOpen, files, onSelect, onClose])

  useEffect(() => {
    selectedRef.current = 0
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen) return null

  return (
    <div ref={menuRef} className="absolute z-50 bg-elevated border border-hover rounded-lg shadow-lg overflow-hidden"
      style={{ bottom: '100%', left: 0, marginBottom: '4px', minWidth: '320px', maxHeight: '240px', overflowY: 'auto' }}>
      <div className="px-3 py-1.5 border-b border-hover">
        <span className="text-[10px] text-text-muted">引用文件</span>
      </div>
      {loading && <div className="px-3 py-2 text-xs text-text-muted">搜索中...</div>}
      {!loading && files.length === 0 && <div className="px-3 py-2 text-xs text-text-muted">未找到匹配的文件</div>}
      {files.map((file, i) => (
        <button key={file} onClick={() => onSelect(file)}
          className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors ${i === selectedRef.current ? 'bg-active' : 'hover:bg-hover'}`}>
          <span className="text-sm">{getFileIcon(file)}</span>
          <span className="text-text-primary font-mono">{file}</span>
        </button>
      ))}
    </div>
  )
}
