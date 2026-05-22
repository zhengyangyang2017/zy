import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

// ============================================
// Types
// ============================================

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

// ============================================
// File icon by extension
// ============================================

const EXT_ICONS: Record<string, string> = {
  ts: '🟦', tsx: '⚛️', js: '🟨', jsx: '⚛️', json: '📋',
  css: '🎨', scss: '🎨', less: '🎨', html: '🌐', svg: '🖼️',
  md: '📝', txt: '📄', yml: '⚙️', yaml: '⚙️', xml: '📋',
  py: '🐍', rs: '🦀', go: '🔵', java: '☕', c: '⚙️', cpp: '⚙️',
  h: '⚙️', sh: '💻', bash: '💻', zsh: '💻', ps1: '💻',
  gitignore: '🙈', env: '🔐', lock: '🔒', png: '🖼️', jpg: '🖼️',
  ico: '🖼️', gif: '🖼️', woff: '🔤', ttf: '🔤', eot: '🔤',
  pdf: '📕', zip: '📦', tar: '📦', gz: '📦',
}

function getFileIcon(name: string, isDir: boolean): string {
  if (isDir) return '📁'
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (EXT_ICONS[ext]) return EXT_ICONS[ext]
  if (name === 'package.json') return '📦'
  if (name.includes('config') || name.includes('rc')) return '⚙️'
  return '📄'
}

// ============================================
// File size formatting
// ============================================

async function getFileSize(_path: string): Promise<string> {
  // We could get this from main process but for now use extension hints
  return ''
}

// ============================================
// Directory tree node
// ============================================

function DirNode({
  path,
  name,
  depth,
  defaultExpanded,
  onSelectFile,
  selectedFile,
}: {
  path: string
  name: string
  depth: number
  defaultExpanded?: boolean
  onSelectFile: (filePath: string) => void
  selectedFile: string | null
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (expanded && !loaded) {
      setLoading(true)
      window.api.listDirectory(path).then((items) => {
        setEntries(items || [])
        setLoaded(true)
        setLoading(false)
      }).catch(() => {
        setLoaded(true)
        setLoading(false)
      })
    }
  }, [expanded, loaded, path])

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-2 py-0.5 text-xs hover:bg-hover flex items-center gap-1 group"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="text-[10px] w-3 flex-shrink-0 text-text-muted">
          {loading ? '⏳' : expanded ? '▾' : '▸'}
        </span>
        <span className="flex-shrink-0">{expanded ? '📂' : '📁'}</span>
        <span className="truncate text-text-secondary">{name}</span>
      </button>
      {expanded && (
        <div>
          {entries.map((entry) =>
            entry.isDirectory ? (
              <DirNode
                key={entry.path}
                path={entry.path}
                name={entry.name}
                depth={depth + 1}
                onSelectFile={onSelectFile}
                selectedFile={selectedFile}
              />
            ) : (
              <button
                key={entry.path}
                onClick={() => onSelectFile(entry.path)}
                className={`w-full text-left px-2 py-0.5 text-xs hover:bg-hover flex items-center gap-1 truncate ${
                  selectedFile === entry.path
                    ? 'bg-active text-primary'
                    : 'text-text-muted'
                }`}
                style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}
              >
                <span className="w-3 flex-shrink-0" />
                <span className="flex-shrink-0">{getFileIcon(entry.name, false)}</span>
                <span className="truncate">{entry.name}</span>
              </button>
            )
          )}
          {loading && (
            <p className="text-xs text-text-muted px-2" style={{ paddingLeft: `${8 + (depth + 1) * 12}px` }}>
              Loading...
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// File preview (right side)
// ============================================

function FilePreview({ filePath }: { filePath: string | null }) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!filePath) {
      setContent(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    window.api.readFileContent(filePath).then((result) => {
      if (!result || result.error) {
        setError(result.error)
        setContent(null)
      } else {
        setContent(result.content)
        setError(null)
      }
      setLoading(false)
    })
  }, [filePath])

  const fileName = filePath?.split(/[/\\]/).pop() || ''
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const lang = ext === 'tsx' ? 'typescript' : ext === 'jsx' ? 'javascript' : ext

  return (
    <div className="flex flex-col h-full">
      <div className="text-xs text-text-muted px-2 py-1 border-b border-hover truncate flex-shrink-0">
        {fileName ? `📄 ${fileName}` : 'No file selected'}
      </div>
      <div className="flex-1 overflow-y-auto select-text">
        {loading ? (
          <p className="text-xs text-text-muted p-2">Loading...</p>
        ) : error ? (
          <p className="text-xs text-error p-2">{error}</p>
        ) : content !== null ? (
          <pre className={`text-xs p-2 whitespace-pre-wrap font-mono text-text-primary`}>
            {content.length > 50000 ? content.slice(0, 50000) + '\n\n... (truncated)' : content}
          </pre>
        ) : (
          <p className="text-xs text-text-muted p-2 text-center mt-8">
            Select a file to preview its content
          </p>
        )}
      </div>
    </div>
  )
}

// ============================================
// Main Files Panel
// ============================================

export function FilesPanel() {
  const [projectRoot, setProjectRoot] = useState<string>('')
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [viewMode, setViewMode] = useState<'tree' | 'preview'>('tree')

  useEffect(() => {
    window.api.getProjectRoot().then((root) => {
      setProjectRoot(root || '')
      window.api.listDirectory(root || '').then((items) => {
        setRootEntries(items || [])
        setLoaded(true)
      }).catch(() => setLoaded(true))
    }).catch(() => setLoaded(true))
  }, [])

  const filteredEntries = useMemo(() => {
    if (!filter) return rootEntries
    const lower = filter.toLowerCase()
    return rootEntries.filter(e => e.name.toLowerCase().includes(lower))
  }, [rootEntries, filter])

  function handleSelectFile(filePath: string) {
    setSelectedFile(filePath)
    setViewMode('preview')
  }

  function handleBackToTree() {
    setViewMode('tree')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-hover">
        {viewMode === 'preview' ? (
          <button
            onClick={handleBackToTree}
            className="text-xs text-text-muted hover:text-text-primary px-1"
          >
            ← 返回
          </button>
        ) : (
          <>
            <input
              type="text"
              placeholder="过滤文件..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted outline-none px-1 py-0.5"
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                className="text-xs text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            )}
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {!loaded ? (
          <p className="text-xs text-text-muted p-2">Loading...</p>
        ) : viewMode === 'preview' ? (
          <FilePreview filePath={selectedFile} />
        ) : (
          <div className="overflow-y-auto h-full">
            {filteredEntries.map((entry) =>
              entry.isDirectory ? (
                <DirNode
                  key={entry.path}
                  path={entry.path}
                  name={entry.name}
                  depth={0}
                  onSelectFile={handleSelectFile}
                  selectedFile={selectedFile}
                />
              ) : (
                <button
                  key={entry.path}
                  onClick={() => handleSelectFile(entry.path)}
                  className={`w-full text-left px-2 py-0.5 text-xs hover:bg-hover flex items-center gap-1 ${
                    selectedFile === entry.path
                      ? 'bg-active text-primary'
                      : 'text-text-muted'
                  }`}
                  style={{ paddingLeft: '20px' }}
                >
                  <span className="w-3 flex-shrink-0" />
                  <span className="flex-shrink-0">{getFileIcon(entry.name, false)}</span>
                  <span className="truncate">{entry.name}</span>
                </button>
              )
            )}
            {filteredEntries.length === 0 && (
              <p className="text-xs text-text-muted p-2 text-center">No files found</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
