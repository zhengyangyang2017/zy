import { ipcMain, clipboard, dialog, BrowserWindow } from 'electron'
import { readFile, readdir, stat } from 'fs/promises'
import { basename, join, relative } from 'path'
import { registerChatIpc } from './services/anthropic'
import { getDb } from './db'
import type { SessionRow, MessageRow } from './db'
import { getKnowledgeStats, startResearch } from './services/learning/orchestrator'
import { enqueueTask, getTasks } from './services/learning/scheduler'
import { execSync } from 'child_process'

export function registerIpcHandlers(): void {
  registerChatIpc()

  ipcMain.handle('clipboard:copy', async (_e, text: string) => {
    clipboard.writeText(text)
  })

  // Session CRUD
  ipcMain.handle('session:list', async () => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT * FROM sessions ORDER BY updated_at DESC'
    ).all() as SessionRow[]
    return rows.map(rowToSession)
  })

  ipcMain.handle('session:create', async (_e, title: string) => {
    const db = getDb()
    const now = new Date().toISOString()
    const session = {
      id: crypto.randomUUID(),
      title,
      created_at: now,
      updated_at: now,
      message_count: 0,
      status: 'active' as const
    }
    db.prepare(
      'INSERT INTO sessions (id, title, created_at, updated_at, message_count, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(session.id, session.title, session.created_at, session.updated_at, session.message_count, session.status)
    return rowToSession(session)
  })

  ipcMain.handle('session:delete', async (_e, id: string) => {
    const db = getDb()
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(id)
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('session:messages', async (_e, sessionId: string) => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'
    ).all(sessionId) as MessageRow[]
    return rows.map(rowToMessage)
  })

  ipcMain.handle('session:addMessage', async (_e, sessionId: string, message: { id: string; sessionId: string; role: string; content: string; createdAt: string }) => {
    const db = getDb()
    db.prepare(
      'INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(message.id, sessionId, message.role, message.content, message.createdAt)
    db.prepare(
      'UPDATE sessions SET updated_at = ?, message_count = message_count + 1 WHERE id = ?'
    ).run(new Date().toISOString(), sessionId)
    return true
  })

  // File operations
  ipcMain.handle('dialog:openFile', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { canceled: true, files: [] }

      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Text', extensions: ['txt', 'md', 'js', 'ts', 'tsx', 'jsx', 'json', 'css', 'html', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'yml', 'yaml', 'xml', 'svg', 'csv'] }
        ]
      })

      if (result.canceled) return { canceled: true, files: [] }

      const files = await Promise.all(
        result.filePaths.map(async (filePath) => {
          try {
            const content = await readFile(filePath, 'utf-8')
            return { path: filePath, name: basename(filePath), content }
          } catch {
            return { path: filePath, name: basename(filePath), content: null, error: '无法读取文件' }
          }
        })
      )

      return { canceled: false, files }
    } catch (err) {
      console.error('[dialog:openFile]', err)
      throw err
    }
  })

  // === App info ===
  ipcMain.handle('app:projectRoot', async () => {
    return process.cwd()
  })

  // === File system browser ===
  ipcMain.handle('fs:listDir', async (_e, dirPath: string) => {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      const items = await Promise.all(
        entries
          .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'out')
          .map(async (entry) => {
            const fullPath = join(dirPath, entry.name)
            const isDir = entry.isDirectory()
            return {
              name: entry.name,
              path: fullPath,
              isDirectory: isDir,
            }
          })
      )
      return items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    } catch (err) {
      console.error('[fs:listDir]', err)
      return []
    }
  })

  ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
    try {
      const content = await readFile(filePath, 'utf-8')
      return { content, error: null }
    } catch (err) {
      return { content: null, error: String(err) }
    }
  })

  // === Git ===
  ipcMain.handle('git:status', async () => {
    try {
      const branch = execSync('git branch --show-current', { encoding: 'utf-8', timeout: 5000 }).trim()
      const status = execSync('git status --short', { encoding: 'utf-8', timeout: 5000 })
      const files = status.split('\n').filter(Boolean).map(line => ({
        status: line.slice(0, 2).trim(),
        file: line.slice(3)
      }))
      return { branch, files, error: null }
    } catch (err) {
      return { branch: '', files: [], error: String(err) }
    }
  })

  ipcMain.handle('git:log', async () => {
    try {
      const log = execSync('git log --oneline -10', { encoding: 'utf-8', timeout: 5000 })
      const commits = log.split('\n').filter(Boolean).map(line => ({
        hash: line.slice(0, 7),
        message: line.slice(8)
      }))
      return { commits, error: null }
    } catch (err) {
      return { commits: [], error: String(err) }
    }
  })

  // === Tasks ===
  ipcMain.handle('tasks:list', async () => {
    return getTasks()
  })

  ipcMain.handle('tasks:create', async (_e, topic: string, priority: number) => {
    return enqueueTask(topic, priority)
  })

  ipcMain.handle('tasks:research', async (_e, topic: string) => {
    return startResearch(topic)
  })

  // === Knowledge stats ===
  ipcMain.handle('knowledge:stats', async () => {
    return getKnowledgeStats()
  })
}

function rowToSession(r: SessionRow) {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
    status: r.status as 'active' | 'background' | 'idle'
  }
}

function rowToMessage(r: MessageRow) {
  return {
    id: r.id,
    sessionId: r.session_id,
    role: r.role as 'user' | 'assistant' | 'system',
    content: r.content,
    createdAt: r.created_at
  }
}
