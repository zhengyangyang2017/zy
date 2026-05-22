import { useState, useCallback, useEffect, useRef } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import type { Message } from '../../types'

interface SelectedFile {
  name: string
  path: string
  content: string | null
  size?: number
  truncated?: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

const MAX_FILE = 20 * 1024 * 1024   // 20MB max read
const MAX_SEND = 100 * 1024         // 100KB sent to AI per file

export function InputArea() {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [files, setFiles] = useState<SelectedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const { addMessage, appendToStream, commitStream, setStreaming, clearStream } =
    useChatStore()
  const isStreaming = useChatStore((s) =>
    activeSessionId ? (s.streamBySession[activeSessionId]?.isStreaming ?? false) : false
  )
  const activeSessionRef = useRef(activeSessionId)
  activeSessionRef.current = activeSessionId

  // Register stream event listeners
  useEffect(() => {
    if (!activeSessionId) return

    const cleanup1 = window.api.onStreamChunk((data) => {
      if (data.sessionId === activeSessionRef.current) {
        appendToStream(activeSessionRef.current!, data.chunk)
      }
    })
    const cleanup2 = window.api.onStreamDone((data) => {
      if (data.sessionId === activeSessionRef.current) {
        const msg = data.message as Message
        commitStream(activeSessionRef.current!, msg)
        try { window.api.saveMessage(activeSessionRef.current!, msg).catch(() => {}) } catch { /* ignore */ }
        setStreaming(activeSessionRef.current!, false)
      }
    })
    const cleanup3 = window.api.onStreamError((data) => {
      if (data.sessionId === activeSessionRef.current) {
        setError(data.error)
        clearStream(activeSessionRef.current!)
        setStreaming(activeSessionRef.current!, false)
      }
    })

    return () => { cleanup1(); cleanup2(); cleanup3() }
  }, [activeSessionId])

  // Read file content from File object (drag-and-drop / paste)
  function readFileObject(file: File) {
    if (file.size > MAX_FILE) {
      setFiles(prev => [...prev, { name: file.name, path: file.name, content: null, size: file.size }])
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const content = reader.result as string | null
      const truncated = (content?.length || 0) > MAX_SEND
      setFiles(prev => [...prev, {
        name: file.name,
        path: file.name,
        content: truncated ? content!.slice(0, 70 * 1024) + '\n\n... [已截断] ...\n\n' + content!.slice(-30 * 1024) : content,
        size: file.size,
        truncated,
      }])
    }
    reader.onerror = () => {
      setFiles(prev => [...prev, { name: file.name, path: file.name, content: null, size: file.size }])
    }
    reader.readAsText(file)
  }

  const handlePickFile = useCallback(async () => {
    setUploading(true)
    try {
      const result = await window.api.openFileDialog()
      if (!result.canceled && result.files.length > 0) {
        setFiles((prev) => [...prev, ...result.files])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '文件选择失败'
      console.error('[file picker]', err)
      setError(msg)
    } finally {
      setUploading(false)
    }
  }, [])

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSend = useCallback(async () => {
    const content = input.trim()
    if ((!content && files.length === 0) || !activeSessionId) return

    setInput('')
    setError(null)

    let messageContent = content
    if (files.length > 0) {
      const fileParts = files.map((f) => {
        if (f.content === null) return `\n\n[文件: ${f.name} - 无法读取]`
        return `\n\n--- 文件: ${f.name} ---\n${f.content}\n--- 文件结束: ${f.name} ---`
      }).join('')
      messageContent = content + fileParts
    }

    const userMsg = {
      id: `msg_${Date.now()}`,
      sessionId: activeSessionId,
      role: 'user' as const,
      content: messageContent,
      createdAt: new Date().toISOString()
    }
    addMessage(activeSessionId, userMsg)
    try { window.api.saveMessage(activeSessionId, userMsg).catch(() => {}) } catch { }
    setFiles([])
    setStreaming(activeSessionId, true)

    const msgs = useChatStore.getState().messagesBySession[activeSessionId] ?? []

    try {
      await window.api.sendMessage({
        sessionId: activeSessionId,
        messages: msgs.map((m) => ({ role: m.role, content: m.content }))
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : '发送失败'
      setError(msg)
      clearStream(activeSessionId)
      setStreaming(activeSessionId, false)
    }
  }, [input, files, activeSessionId])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const droppedFiles = e.dataTransfer?.files
    if (droppedFiles) {
      for (const file of Array.from(droppedFiles)) {
        readFileObject(file)
      }
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  if (!activeSessionId) return null

  return (
    <div
      className={`border-t border-hover p-4 bg-surface relative ${dragOver ? 'ring-2 ring-primary ring-inset' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {dragOver && (
        <div className="absolute inset-0 bg-primary/10 flex items-center justify-center z-10 pointer-events-none">
          <span className="text-primary font-medium">释放文件以上传</span>
        </div>
      )}
      {error && (
        <div className="max-w-4xl mx-auto mb-2 px-4 py-2 bg-red-900/30 border border-red-800 rounded-lg text-sm text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ml-2">✕</button>
        </div>
      )}

      {/* Selected files */}
      {files.length > 0 && (
        <div className="max-w-4xl mx-auto mb-2">
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <span
                key={i}
                title={f.path}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs ${
                  f.content === null
                    ? 'bg-red-900/30 text-red-300'
                    : f.truncated
                    ? 'bg-yellow-900/30 text-yellow-300'
                    : 'bg-active text-text-secondary'
                }`}
              >
                {f.content === null ? '⚠ ' : f.truncated ? '✂ ' : '📄 '}
                {f.name}
                {f.size !== undefined && (
                  <span className="text-[10px] opacity-60">{formatSize(f.size)}</span>
                )}
                <button
                  onClick={() => removeFile(i)}
                  className="text-text-muted hover:text-red-400 ml-0.5"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-text-muted">
            <span>{files.length} 个文件 · {formatSize(files.reduce((s, f) => s + (f.size || 0), 0))}</span>
            {files.some(f => f.truncated) && (
              <span className="text-yellow-400">✂ 已截断大文件</span>
            )}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <button
          onClick={handlePickFile}
          disabled={isStreaming || uploading}
          className="flex items-center gap-1 px-2.5 py-2.5 text-text-muted hover:text-text-primary hover:bg-hover disabled:opacity-30 rounded-lg transition-colors flex-shrink-0"
          title="添加文件"
        >
          <span className="text-base leading-none">{uploading ? '⏳' : '📎'}</span>
        </button>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，Shift+Enter 换行，Enter 发送..."
          rows={1}
          className="flex-1 bg-elevated border border-hover rounded-xl px-4 py-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-primary transition-colors"
          onPaste={(e) => {
            const items = e.clipboardData?.items
            if (items) {
              for (const item of Array.from(items)) {
                if (item.kind === 'file') {
                  e.preventDefault()
                  const file = item.getAsFile()
                  if (file) readFileObject(file)
                }
              }
            }
          }}
        />
        <button
          onClick={handleSend}
          disabled={(!input.trim() && files.length === 0) || isStreaming}
          className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
        >
          {isStreaming ? '⏳' : '发送'}
        </button>
      </div>
    </div>
  )
}
