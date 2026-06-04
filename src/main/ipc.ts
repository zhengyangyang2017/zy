import { ipcMain, clipboard, dialog, BrowserWindow } from 'electron'
import { readFile, readdir, stat as fsStat, open as fsOpen } from 'fs/promises'
import { basename, join } from 'path'
import { registerChatIpc } from './services/anthropic'
import { getDb } from './db'
import type { SessionRow, MessageRow } from './db'
import { getKnowledgeStats, startResearch } from './services/learning/orchestrator'
import { enqueueTask, getTasks } from './services/learning/scheduler'
import { execSync } from 'child_process'
import { getOrchestrator } from './services/cluster'
import { getEventBus } from './services/cluster/event-bus'
import { loadConfig, saveConfig } from './services/config'
import { generateSeedData } from './services/seed-generator'
import { createSession, writeToSession, resizeSession, destroySession, getSessionBuffer } from './services/terminal'
import { shouldIgnore } from './services/gitignore'
import { saveFeedback } from './services/feedback'
import { initLicense, getLicenseStatus, activateLicense, loginWithPhone, logout } from './services/license'
import type { AppConfig, ClusterTaskSubmitParams, ClusterResultPayload, ExportResult } from '../types/ipc'

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

  ipcMain.handle('session:rename', async (_e, id: string, title: string) => {
    const db = getDb()
    db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?')
      .run(title, new Date().toISOString(), id)
    return true
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
      const rootPath = process.cwd()
      const entries = await readdir(dirPath, { withFileTypes: true })
      const items = await Promise.all(
        entries
          .filter(e => {
            const absPath = join(dirPath, e.name)
            const relPath = absPath.replace(rootPath, '').replace(/^[/\\]/, '').replace(/\\/g, '/')
            return !shouldIgnore(rootPath, relPath)
          })
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

  // === File search for @mentions ===
  ipcMain.handle('fs:searchFiles', async (_e, query: string) => {
    try {
      const rootPath = process.cwd()
      const { readdir, stat } = await import('fs/promises')
      const { join, relative } = await import('path')

      async function walk(dir: string, results: string[], depth: number): Promise<void> {
        if (depth > 4 || results.length >= 20) return
        try {
          const entries = await readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'out' || entry.name === '.git') continue
            const fullPath = join(dir, entry.name)
            const relPath = relative(rootPath, fullPath).replace(/\\/g, '/')
            const lowerQuery = query.toLowerCase()
            if (relPath.toLowerCase().includes(lowerQuery)) {
              try {
                const st = await stat(fullPath)
                results.push(relPath + (st.isDirectory() ? '/' : ''))
              } catch { /* skip */ }
            }
            if (entry.isDirectory() && depth < 4 && results.length < 20) {
              await walk(fullPath, results, depth + 1)
            }
          }
        } catch { /* skip */ }
      }

      const results: string[] = []
      await walk(rootPath, results, 0)
      return results.slice(0, 15)
    } catch (err) {
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

  // === Terminal (PTY-based interactive shell) ===
  ipcMain.handle('terminal:create', async (event, sessionId: string, cols: number, rows: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return ''
    return createSession(win, sessionId, cols, rows)
  })

  ipcMain.handle('terminal:write', async (_e, sessionId: string, data: string) => {
    writeToSession(sessionId, data)
  })

  ipcMain.handle('terminal:resize', async (_e, sessionId: string, cols: number, rows: number) => {
    resizeSession(sessionId, cols, rows)
  })

  ipcMain.handle('terminal:destroy', async (_e, sessionId: string) => {
    destroySession(sessionId)
  })

  // === Agent Cluster ===
  ipcMain.handle('cluster:state', async () => {
    const orch = getOrchestrator()
    const state = orch.getState()
    return {
      ...state,
      agents: [...state.agents.entries()].map(([agentId, info]) => ({ agentId, ...info })),
    }
  })

  ipcMain.handle('cluster:agents', async () => {
    return getOrchestrator().getAgentList()
  })

  ipcMain.handle('cluster:queue', async () => {
    return getOrchestrator().getQueueStats()
  })

  ipcMain.handle('cluster:events', async (_e, topic: string) => {
    return getOrchestrator().getEvents(topic, 50)
  })

  ipcMain.handle('cluster:submitGoal', async (_e, goal: string, context?: string) => {
    return getOrchestrator().submitGoal(goal, context)
  })

  ipcMain.handle('cluster:submitTask', async (_e, params: ClusterTaskSubmitParams) => {
    return getOrchestrator().submitTask(params.type, params.role, params.input, params.priority)
  })

  ipcMain.handle('cluster:isRunning', async () => {
    return getOrchestrator().isRunning
  })

  // Forward cluster events to renderer for real-time UI updates
  try {
    const bus = getEventBus()
    bus.subscribe('task:completed', (event) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('cluster:event', { type: 'task-update' })
        const payload = event.payload as { task?: { type?: string; id?: string }; result?: { output?: string } } | undefined
        if (payload?.task?.type && payload?.result?.output) {
          const result: ClusterResultPayload = {
            taskType: payload.task.type,
            taskId: payload.task.id || '',
            output: payload.result.output.slice(0, 2000),
            success: true,
          }
          win.webContents.send('chat:cluster-result', result)
        }
      }
    })
    bus.subscribe('task:failed', (event) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('cluster:event', { type: 'task-update' })
        const payload = event.payload as { taskId?: string; error?: string } | undefined
        if (payload?.taskId) {
          const result: ClusterResultPayload = {
            taskId: payload.taskId,
            error: payload.error || 'Unknown error',
            success: false,
          }
          win.webContents.send('chat:cluster-result', result)
        }
      }
    })
    bus.subscribe('agent:heartbeat', () => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('cluster:event', { type: 'agent-update' })
      }
    })
    bus.subscribe('workflow:created', () => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('cluster:event', { type: 'workflow-update' })
      }
    })
  } catch { /* event forwarding is best-effort */ }

  // === Message Search ===
  ipcMain.handle('messages:search', async (_e, query: string) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT m.*, s.title as session_title
      FROM messages m
      JOIN sessions s ON m.session_id = s.id
      WHERE m.content LIKE ?
      ORDER BY m.created_at DESC
      LIMIT 50
    `).all(`%${query}%`) as (MessageRow & { session_title: string })[]
    return rows.map(r => ({
      id: r.id,
      sessionId: r.session_id,
      sessionTitle: r.session_title,
      role: r.role,
      content: r.content.slice(0, 300),
      createdAt: r.created_at,
    }))
  })

  // === Export ===
  ipcMain.handle('export:session', async (event, sessionId: string, format: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window' }

    const db = getDb()
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow | undefined
    if (!session) return { success: false, error: 'Session not found' }

    const messages = db.prepare(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC'
    ).all(sessionId) as MessageRow[]

    const ext = format === 'md' ? 'md' : 'json'
    const result = await dialog.showSaveDialog(win, {
      title: '导出会话',
      defaultPath: `${session.title.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`,
      filters: [
        format === 'md'
          ? { name: 'Markdown', extensions: ['md'] }
          : { name: 'JSON', extensions: ['json'] },
      ],
    })

    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }

    try {
      let content: string
      if (format === 'md') {
        content = `# ${session.title}\n\n创建: ${session.created_at}\n消息数: ${session.message_count}\n\n---\n\n`
        content += messages.map(m =>
          `### ${m.role === 'user' ? '👤 用户' : '🤖 AI'} — ${m.created_at}\n\n${m.content}\n`
        ).join('\n\n---\n\n')
      } else {
        content = JSON.stringify({ session, messages }, null, 2)
      }
      const { writeFileSync } = await import('fs')
      writeFileSync(result.filePath, content, 'utf-8')
      return { success: true, path: result.filePath }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('export:knowledge', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window' }

    const result = await dialog.showSaveDialog(win, {
      title: '导出知识图谱',
      defaultPath: 'knowledge-graph.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })

    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' }

    try {
      const db = getDb()
      const nodes = db.prepare('SELECT * FROM knowledge_nodes ORDER BY created_at DESC').all()
      const edges = db.prepare('SELECT * FROM knowledge_edges ORDER BY created_at DESC').all()
      const content = JSON.stringify({ nodes, edges, exportedAt: new Date().toISOString() }, null, 2)
      const { writeFileSync } = await import('fs')
      writeFileSync(result.filePath, content, 'utf-8')
      return { success: true, path: result.filePath }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // === Settings ===
  ipcMain.handle('config:load', async () => {
    return loadConfig()
  })

  ipcMain.handle('config:save', async (_e, updates: Record<string, unknown>) => {
    return saveConfig(updates as Partial<AppConfig>)
  })

  // === Feedback ===
  ipcMain.handle('feedback:submit', async (_e, payload: { message: string; diagnostics: string }) => {
    return saveFeedback(payload)
  })

  // === Dev: Seed data generator ===
  ipcMain.handle('dev:generateSeedData', async () => {
    return generateSeedData()
  })

  // === License ===
  ipcMain.handle('license:status', async () => {
    return getLicenseStatus()
  })

  ipcMain.handle('license:activate', async (_e, activationToken: string) => {
    return activateLicense(activationToken)
  })

  ipcMain.handle('license:login', async (_e, phone: string, code: string) => {
    return loginWithPhone(phone, code)
  })

  ipcMain.handle('license:logout', async () => {
    logout()
    return getLicenseStatus()
  })

  ipcMain.handle('license:sendCode', async (_e, phone: string) => {
    const res = await fetch('https://landing-three-sigma-75.vercel.app/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(err.error || '发送失败')
    }
    return await res.json()
  })
}

function rowToSession(r: SessionRow) {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
    status: r.status as 'active' | 'background' | 'idle',
    parentSessionId: r.parent_session_id ?? undefined,
    branchPoint: r.branch_point ?? undefined,
    pinned: r.pinned === 1,
    tags: r.tags ? r.tags.split(',').filter(Boolean) : [],
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
