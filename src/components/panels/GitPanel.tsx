import { useState, useEffect, useCallback } from 'react'
import { InlineSpinner } from '../ui/Spinner'

// ============================================
// Types
// ============================================

interface GitStatus {
  branch: string
  files: { status: string; file: string }[]
  error: string | null
}

interface GitLog {
  commits: { hash: string; message: string }[]
  error: string | null
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  'M':  { label: 'M',  color: 'text-warning' },
  'A':  { label: 'A',  color: 'text-success' },
  'D':  { label: 'D',  color: 'text-error' },
  'R':  { label: 'R',  color: 'text-primary' },
  '??': { label: '?',  color: 'text-text-muted' },
  'AM': { label: 'AM', color: 'text-warning' },
  'MM': { label: 'MM', color: 'text-warning' },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_BADGE[status] || { label: status, color: 'text-text-muted' }
  return (
    <span className={`text-[10px] font-mono w-5 flex-shrink-0 ${config.color}`}>
      {config.label}
    </span>
  )
}

// ============================================
// Diff viewer
// ============================================

function DiffViewer({ file, onClose }: { file: string; onClose: () => void }) {
  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.gitDiff(file).then((result: { diff: string; error: string | null }) => {
      setDiff(result.error ? `错误: ${result.error}` : result.diff)
      setLoading(false)
    }).catch((err) => {
      console.error(`[GitPanel] Failed to get diff for "${file}":`, err)
      setDiff('无法加载 diff')
      setLoading(false)
    })
  }, [file])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-hover">
        <button onClick={onClose} className="text-xs text-text-muted hover:text-text-primary">
          ← 返回
        </button>
        <span className="text-xs text-text-secondary truncate">{file}</span>
      </div>
      <div className="flex-1 overflow-y-auto select-text">
        {loading ? (
          <div className="flex items-center gap-1.5 p-2">
            <InlineSpinner />
            <span className="text-xs text-text-muted">加载 diff...</span>
          </div>
        ) : (
          <pre className="text-xs p-2 font-mono whitespace-pre-wrap text-text-primary">
            {diff || '无变更'}
          </pre>
        )}
      </div>
    </div>
  )
}

// ============================================
// Main Panel
// ============================================

export function GitPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [log, setLog] = useState<GitLog | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [view, setView] = useState<'overview' | 'diff'>('overview')
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [s, l] = await Promise.all([
        window.api.gitStatus() as Promise<GitStatus>,
        window.api.gitLog() as Promise<GitLog>,
      ])
      setStatus(s)
      setLog(l)
    } catch (err) {
      console.error('[GitPanel] Failed to refresh git status:', err)
    }
    setRefreshing(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  function handleFileClick(file: string) {
    setSelectedFile(file)
    setView('diff')
  }

  function handleBack() {
    setView('overview')
    setSelectedFile(null)
  }

  if (view === 'diff' && selectedFile) {
    return <DiffViewer file={selectedFile} onClose={handleBack} />
  }

  const isError = status?.error || log?.error
  const isEmpty = !status?.files.length && !log?.commits.length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-hover">
        {status?.branch ? (
          <span className="text-xs text-text-secondary flex items-center gap-1">
            🔀 <span className="text-primary font-medium">{status.branch}</span>
          </span>
        ) : (
          <span className="text-xs text-text-muted">无仓库</span>
        )}
        <button
          onClick={refresh}
          className={`text-xs text-text-muted hover:text-text-primary transition-colors ${refreshing ? 'animate-spin' : ''}`}
        >
          ↻
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isError ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
            <p className="text-2xl">⚠️</p>
            <p className="text-xs text-error text-center">{status?.error || log?.error}</p>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-2xl">✅</p>
            <p className="text-xs text-text-muted">工作区干净</p>
          </div>
        ) : (
          <>
            {/* Changed files */}
            {status?.files && status.files.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] text-text-muted border-b border-hover/50">
                  变更 ({status.files.length})
                </div>
                {status.files.map((f) => (
                  <button
                    key={f.file}
                    onClick={() => handleFileClick(f.file)}
                    className="w-full text-left px-2 py-1 hover:bg-hover flex items-center gap-1.5 border-b border-hover/30"
                  >
                    <StatusBadge status={f.status} />
                    <span className="text-xs text-text-primary truncate">{f.file}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Recent commits */}
            {log?.commits && log.commits.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] text-text-muted border-b border-hover/50">
                  最近提交
                </div>
                {log.commits.map((c) => (
                  <div key={c.hash} className="px-2 py-1 border-b border-hover/30 hover:bg-hover">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-primary flex-shrink-0">{c.hash}</span>
                      <span className="text-xs text-text-primary truncate">{c.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
