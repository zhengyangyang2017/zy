import { useState, useEffect, useRef } from 'react'

// ============================================
// ANSI color parsing
// ============================================

const ANSI_REGEX = /\x1b\[([\d;]*)m/g

const ANSI_COLORS: Record<string, string> = {
  '0': '',        // reset
  '1': 'font-weight:bold;',
  '2': 'opacity:0.7;',
  '3': 'font-style:italic;',
  '4': 'text-decoration:underline;',
  '30': 'color:#cccccc;',
  '31': 'color:#ff5f57;',
  '32': 'color:#28c840;',
  '33': 'color:#febc2e;',
  '34': 'color:#4A90D9;',
  '35': 'color:#bd93f9;',
  '36': 'color:#8be9fd;',
  '37': 'color:#f8f8f2;',
  '90': 'color:#666666;',
  '40': 'background:#1a1a2e;',
  '41': 'background:#ff5f57;',
  '42': 'background:#28c840;',
}

function parseAnsiToHtml(text: string): string {
  let result = ''
  let currentStyle = ''
  let openSpans = 0
  let lastIndex = 0
  let match: RegExpExecArray | null

  const regex = new RegExp(ANSI_REGEX.source, 'g')
  while ((match = regex.exec(text)) !== null) {
    // Add text before this match with current style
    if (match.index > lastIndex) {
      const segment = text.slice(lastIndex, match.index)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      if (openSpans > 0) {
        result += `<span style="${currentStyle}">${segment}</span>`
      } else {
        result += segment
      }
    }

    // Parse the ANSI code
    const codes = match[1] ? match[1].split(';') : ['0']
    for (const code of codes) {
      if (code === '0') {
        currentStyle = ''
        openSpans = 0
      } else if (ANSI_COLORS[code]) {
        currentStyle += ANSI_COLORS[code]
        openSpans = 1
      }
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < text.length) {
    const segment = text.slice(lastIndex)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    result += segment
  }

  return result
}

export function BottomPanel() {
  const [output, setOutput] = useState<string[]>([])
  const [command, setCommand] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [running, setRunning] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [shellReady, setShellReady] = useState(true)
  const [cwd, setCwd] = useState('')

  // Initialize: get cwd
  useEffect(() => {
    window.api.getProjectRoot().then(setCwd).catch(() => {})
  }, [])

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  async function execute(cmd: string) {
    if (!cmd.trim() || running) return
    setRunning(true)
    const prompt = `\x1b[36m❯ ${cmd}\x1b[0m\n`
    setOutput(prev => [...prev, prompt])

    try {
      const result = await window.api.executeShellCommand(cmd)
      const display = (result && result.error)
        ? `\x1b[31m${result.error}\x1b[0m\n`
        : (result?.output || '')
      setOutput(prev => [...prev, display])
    } catch {
      setOutput(prev => [...prev, '\x1b[31mFailed to execute command\x1b[0m\n'])
    }

    setRunning(false)
    setHistory(prev => [cmd, ...prev].slice(0, 100))
    setHistoryIdx(-1)
    setCommand('')
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length > 0 && historyIdx < history.length - 1) {
        const newIdx = historyIdx + 1
        setHistoryIdx(newIdx)
        setCommand(history[newIdx])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx > 0) {
        const newIdx = historyIdx - 1
        setHistoryIdx(newIdx)
        setCommand(history[newIdx])
      } else {
        setHistoryIdx(-1)
        setCommand('')
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-hover">
        <span className="text-xs text-text-muted flex items-center gap-1">
          📜 终端
          {cwd && <span className="text-[10px] text-text-muted/50">— {cwd}</span>}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-warning' : shellReady ? 'bg-success' : 'bg-error'}`} />
      </div>

      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs select-text"
        onClick={() => inputRef.current?.focus()}
      >
        {output.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-text-muted">输入命令开始</p>
          </div>
        ) : (
          output.map((chunk, i) => (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: parseAnsiToHtml(chunk) }}
            />
          ))
        )}
        {running && <span className="inline-block w-2 h-4 bg-text-muted animate-pulse ml-0.5" />}
      </div>

      {/* Input line */}
      <div className="flex items-center gap-1 px-2 py-1 border-t border-hover bg-surface">
        <span className="text-xs text-primary font-mono flex-shrink-0">❯</span>
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              execute(command)
            } else {
              handleKeyDown(e)
            }
          }}
          placeholder="输入命令..."
          className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted outline-none font-mono"
          disabled={running}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  )
}
