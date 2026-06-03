import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const TERMINAL_ID = 'default'

const darkTheme = {
  background: '#0a0a14',
  foreground: '#cccccc',
  cursor: '#4A90D9',
  selectionBackground: '#252545',
  black: '#1a1a2e',
  red: '#ff5f57',
  green: '#28c840',
  yellow: '#febc2e',
  blue: '#4A90D9',
  magenta: '#bd93f9',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#666666',
  brightRed: '#ff5f57',
  brightGreen: '#28c840',
  brightYellow: '#febc2e',
  brightBlue: '#4A90D9',
  brightMagenta: '#bd93f9',
  brightCyan: '#8be9fd',
  brightWhite: '#f8f8f2',
}

const lightTheme = {
  background: '#ffffff',
  foreground: '#1a1a1a',
  cursor: '#3b82c4',
  selectionBackground: '#e8ecf4',
  black: '#f0f0f5',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#d97706',
  blue: '#3b82c4',
  magenta: '#7c3aed',
  cyan: '#0891b2',
  white: '#1a1a1a',
  brightBlack: '#999999',
  brightRed: '#dc2626',
  brightGreen: '#16a34a',
  brightYellow: '#d97706',
  brightBlue: '#3b82c4',
  brightMagenta: '#7c3aed',
  brightCyan: '#0891b2',
  brightWhite: '#1a1a1a',
}

export function BottomPanel() {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const isLight = document.documentElement.classList.contains('light')
    const theme = isLight ? lightTheme : darkTheme

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      theme,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    terminalRef.current = term
    fitAddonRef.current = fitAddon

    if (containerRef.current) {
      term.open(containerRef.current)
      fitAddon.fit()
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!fitAddonRef.current || !terminalRef.current) return
      fitAddonRef.current.fit()
      window.api.resizeTerminal(TERMINAL_ID, term.cols, term.rows)
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    term.onData((data) => {
      window.api.writeToTerminal(TERMINAL_ID, data)
    })

    window.api.createTerminal(TERMINAL_ID, term.cols, term.rows).then((buffer) => {
      if (buffer) {
        term.write(buffer)
      }
    })

    const unsubData = window.api.onTerminalData(({ data }) => {
      term.write(data)
    })

    const unsubExit = window.api.onTerminalExit(({ exitCode }) => {
      term.write(`\r\n\n[Process exited with code ${exitCode}]\r\n`)
    })

    return () => {
      unsubData()
      unsubExit()
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center justify-between px-3 py-1 border-b border-hover">
        <span className="text-xs text-text-muted">{t('terminal.title')}</span>
      </div>
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  )
}
