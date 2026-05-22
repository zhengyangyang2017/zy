import { ipcMain, clipboard, dialog, BrowserWindow } from 'electron'
import { readFile, readdir, stat as fsStat, open as fsOpen } from 'fs/promises'
import { basename, join, relative } from 'path'
import { registerChatIpc } from './services/anthropic'
import { getDb } from './db'
import type { SessionRow, MessageRow } from './db'
import { getKnowledgeStats, startResearch } from './services/learning/orchestrator'
import { enqueueTask, getTasks } from './services/learning/scheduler'
import { execSync, exec } from 'child_process'

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

      const MAX_FILE_READ = 20 * 1024 * 1024 // 20MB max read per file
      const MAX_FILE_SEND = 100 * 1024 // 100KB sent to AI per file (truncated)
      const MAX_TOTAL_SEND = 500 * 1024 // 500KB total sent to AI
      const MAX_FILES = 50

      let totalSize = 0
      const files = []

      for (const filePath of result.filePaths.slice(0, MAX_FILES)) {
        try {
          const st = await fsStat(filePath)
          const fileSize = st.size

          if (fileSize > MAX_FILE_READ) {
            files.push({
              path: filePath,
              name: basename(filePath),
              content: null,
              size: fileSize,
              truncated: false,
              error: `文件过大 (${(fileSize / 1024 / 1024).toFixed(0)}MB > 20MB)`,
            })
            continue
          }

          let content: string
          let truncated = false

          if (fileSize > MAX_FILE_SEND) {
            // Read head for truncation
            const headSize = 70 * 1024
            const tailSize = Math.min(30 * 1024, fileSize - headSize)
            const head = (await readFile(filePath, { encoding: 'utf-8' })).slice(0, headSize)
            const tailFd = await fsOpen(filePath, 'r')
            const tailBuf = Buffer.alloc(tailSize)
            await tailFd.read(tailBuf, 0, tailSize, fileSize - tailSize)
            await tailFd.close()
            const tail = tailBuf.toString('utf-8')
            const skipped = ((fileSize - headSize - tailSize) / 1024).toFixed(0)
            content = head + `\n\n... [${skipped}KB 已截断] ...\n\n` + tail
            truncated = true
          } else {
            content = await readFile(filePath, 'utf-8')
          }

          totalSize += content.length
          if (totalSize > MAX_TOTAL_SEND && files.length > 0) break

          files.push({
            path: filePath,
            name: basename(filePath),
            content,
            size: fileSize,
            truncated,
          })
        } catch {
          files.push({
            path: filePath,
            name: basename(filePath),
            content: null,
            size: 0,
            truncated: false,
            error: '无法读取文件',
          })
        }
      }

      const truncatedCount = result.filePaths.length - files.length
      return { canceled: false, files, totalFiles: result.filePaths.length, skipped: truncatedCount }
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

  ipcMain.handle('git:diff', async (_e, file: string) => {
    try {
      const diff = execSync(`git diff -- "${file}"`, { encoding: 'utf-8', timeout: 5000 })
      const staged = execSync(`git diff --cached -- "${file}"`, { encoding: 'utf-8', timeout: 5000 })
      return { diff: staged + diff, error: null }
    } catch (err) {
      return { diff: '', error: String(err) }
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

  // === Terminal ===
  ipcMain.handle('terminal:exec', async (_e, cmd: string) => {
    return new Promise<{ output: string; error: string | null }>((resolve) => {
      const opts = { cwd: process.cwd(), timeout: 30000, maxBuffer: 1024 * 1024 }
      exec(cmd, opts, (err, stdout, stderr) => {
        if (err) {
          resolve({ output: stderr || err.message, error: null })
        } else {
          resolve({ output: stdout || stderr || '', error: null })
        }
      })
    })
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
