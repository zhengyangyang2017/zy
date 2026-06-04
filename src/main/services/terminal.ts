import { spawn, IPty } from 'node-pty'
import { BrowserWindow } from 'electron'

interface PtySession {
  pty: IPty
  buffer: string
  cols: number
  rows: number
}

const sessions = new Map<string, PtySession>()
const MAX_BUFFER = 50000

function getShell(): string {
  if (process.platform === 'win32') {
    return 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

export function createSession(
  win: BrowserWindow,
  sessionId: string,
  cols: number,
  rows: number,
  cwd?: string
): string {
  const existing = sessions.get(sessionId)
  if (existing) {
    existing.pty.resize(cols, rows)
    existing.cols = cols
    existing.rows = rows
    return existing.buffer
  }

  const shell = getShell()
  const pty = spawn(shell, [], {
    name: 'xterm-color',
    cols,
    rows,
    cwd: cwd || process.cwd(),
    env: process.env as Record<string, string>,
  })

  const session: PtySession = { pty, buffer: '', cols, rows }
  sessions.set(sessionId, session)

  pty.onData((data: string) => {
    session.buffer = (session.buffer + data).slice(-MAX_BUFFER)
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:data', { sessionId, data })
    }
  })

  pty.onExit(({ exitCode, signal }) => {
    if (!win.isDestroyed()) {
      win.webContents.send('terminal:exit', { sessionId, exitCode, signal })
    }
    sessions.delete(sessionId)
  })

  return ''
}

export function writeToSession(sessionId: string, data: string): void {
  sessions.get(sessionId)?.pty.write(data)
}

export function resizeSession(sessionId: string, cols: number, rows: number): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.cols = cols
    session.rows = rows
    session.pty.resize(cols, rows)
  }
}

export function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId)
  if (session) {
    session.pty.kill()
    sessions.delete(sessionId)
  }
}

export function getSessionBuffer(sessionId: string): string {
  return sessions.get(sessionId)?.buffer || ''
}

export function destroyAllSessions(): void {
  for (const [, session] of sessions) {
    session.pty.kill()
  }
  sessions.clear()
}
