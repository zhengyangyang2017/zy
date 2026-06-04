# Phase 2 Power User Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 power-user features: token context visualization, agent cluster dashboard, session management (tags/pinning/context-menu), and session export with toast notifications.

**Architecture:** Four independent features that converge in StatusBar and SessionSidebar. Token bar and agent dashboard are StatusBar extensions — the bar shows compact info, clicking opens detail views. Session management adds DB columns (pinned, tags) + new IPC handlers + a context menu component. Export reuses existing IPC and is triggered from the context menu. A lightweight Toast system provides user feedback for export/save actions.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Zustand, better-sqlite3, Electron 33

---

### Task 1: Update Types and DB for Phase 2

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/main/db.ts`

- [ ] **Step 1: Update Session type**

In `src/types/index.ts`, update Session:
```typescript
export interface Session {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  status: 'active' | 'background' | 'idle'
  parentSessionId?: string
  branchPoint?: string
  pinned?: boolean      // NEW
  tags?: string[]        // NEW
}
```

And add a new type:
```typescript
export interface ClusterState {
  agents: Array<{ agentId: string; status: string; role: string; tasksCompleted: number; tasksFailed: number; currentTask?: string }>
  queueLength: number
  totalCompleted: number
  totalFailed: number
  isRunning: boolean
}
```

- [ ] **Step 2: Add DB columns**

In `src/main/db.ts`, in `initTables()`, add after the existing session migrations:
```typescript
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0`)
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN tags TEXT DEFAULT ''`)
} catch { /* column already exists */ }
```

Update `SessionRow` interface:
```typescript
export interface SessionRow {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
  status: string
  parent_session_id?: string | null
  branch_point?: string | null
  pinned?: number | null
  tags?: string | null
}
```

- [ ] **Step 3: Update rowToSession in ipc.ts**

In `src/main/ipc.ts`:
```typescript
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
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
git add src/types/index.ts src/main/db.ts src/main/ipc.ts
git commit -m "feat: add pinned/tags to Session, ClusterState type, DB columns"
```

---

### Task 2: Add sessionStore Methods for Pin/Tag

**Files:**
- Modify: `src/stores/sessionStore.ts`

- [ ] **Step 1: Add methods to sessionStore**

```typescript
// Add to SessionState interface:
togglePin: (id: string) => void
setTags: (id: string, tags: string[]) => void

// Add to create() implementation:
togglePin: (id) =>
  set((s) => ({
    sessions: s.sessions.map((sess) =>
      sess.id === id ? { ...sess, pinned: !sess.pinned } : sess
    )
  })),

setTags: (id, tags) =>
  set((s) => ({
    sessions: s.sessions.map((sess) =>
      sess.id === id ? { ...sess, tags } : sess
    )
  })),
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/stores/sessionStore.ts
git commit -m "feat: add togglePin and setTags to sessionStore"
```

---

### Task 3: Add clusterStore for Dashboard State

**Files:**
- Create: `src/stores/clusterStore.ts`

- [ ] **Step 1: Write clusterStore**

```typescript
// src/stores/clusterStore.ts
import { create } from 'zustand'
import type { ClusterState } from '../types'

interface ClusterStoreState {
  data: ClusterState | null
  dashboardOpen: boolean
  setData: (data: ClusterState) => void
  toggleDashboard: () => void
  setDashboardOpen: (open: boolean) => void
}

export const useClusterStore = create<ClusterStoreState>()((set) => ({
  data: null,
  dashboardOpen: false,
  setData: (data) => set({ data }),
  toggleDashboard: () => set((s) => ({ dashboardOpen: !s.dashboardOpen })),
  setDashboardOpen: (open) => set({ dashboardOpen: open }),
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/clusterStore.ts
git commit -m "feat: add clusterStore for dashboard state"
```

---

### Task 4: Add Session IPC Handlers (update, search)

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add session:update handler**

In `src/main/ipc.ts`, after existing session handlers:
```typescript
ipcMain.handle('session:update', async (_e, id: string, updates: Record<string, unknown>) => {
  const db = getDb()
  const sets: string[] = []
  const values: unknown[] = []

  if ('pinned' in updates) {
    sets.push('pinned = ?')
    values.push(updates.pinned ? 1 : 0)
  }
  if ('tags' in updates) {
    sets.push('tags = ?')
    values.push(Array.isArray(updates.tags) ? (updates.tags as string[]).join(',') : '')
  }
  if ('title' in updates) {
    sets.push('title = ?')
    values.push(updates.title)
  }

  if (sets.length === 0) return false
  sets.push("updated_at = ?")
  values.push(new Date().toISOString())
  values.push(id)

  db.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  return true
})
```

- [ ] **Step 2: Add session:search handler**

```typescript
ipcMain.handle('session:search', async (_e, query: string) => {
  const db = getDb()
  // Search in session titles AND message content
  const sessionRows = db.prepare(`
    SELECT DISTINCT s.* FROM sessions s
    LEFT JOIN messages m ON s.id = m.session_id
    WHERE s.title LIKE ? OR m.content LIKE ?
    ORDER BY s.updated_at DESC
    LIMIT 20
  `).all(`%${query}%`, `%${query}%`) as SessionRow[]
  return sessionRows.map(rowToSession)
})
```

- [ ] **Step 3: Expose in preload**

Add to `src/preload/index.ts`:
```typescript
updateSession: (id: string, updates: Record<string, unknown>) => ipcRenderer.invoke('session:update', id, updates),
searchSessions: (query: string) => ipcRenderer.invoke('session:search', query),
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
git add src/main/ipc.ts src/preload/index.ts
git commit -m "feat: add session:update and session:search IPC handlers"
```

---

### Task 5: Create TokenUsagePopover Component

**Files:**
- Create: `src/components/chat/TokenUsagePopover.tsx`
- Modify: `src/components/shell/StatusBar.tsx`

- [ ] **Step 1: Write TokenUsagePopover**

```typescript
// src/components/chat/TokenUsagePopover.tsx
import { useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useSessionStore } from '../../stores/sessionStore'

function estimateTokens(text: string): number {
  // Rough: 3 chars ≈ 1 token for CJK, 4 chars ≈ 1 token for English
  if (!text) return 0
  const cjkChars = (text.match(/[一-鿿㐀-䶿]/g) || []).length
  const otherChars = text.length - cjkChars
  return Math.ceil(cjkChars / 3 + otherChars / 4)
}

const MAX_TOKENS = 128000 // configurable, matches deepseek-v4-pro default

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function TokenUsagePopover({ isOpen, onClose }: Props) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const messages = useChatStore((s) => activeSessionId ? (s.messagesBySession[activeSessionId] ?? []) : [])

  const stats = useMemo(() => {
    let systemTokens = 0, userTokens = 0, assistantTokens = 0
    for (const m of messages) {
      const t = estimateTokens(m.content)
      if (m.role === 'system') systemTokens += t
      else if (m.role === 'user') userTokens += t
      else assistantTokens += t
    }
    const total = systemTokens + userTokens + assistantTokens
    const remaining = MAX_TOKENS - total
    const pct = Math.round((total / MAX_TOKENS) * 100)
    return { systemTokens, userTokens, assistantTokens, total, remaining, pct }
  }, [messages])

  if (!isOpen) return null

  return (
    <div className="absolute bottom-8 right-0 z-50 bg-elevated border border-hover rounded-xl shadow-2xl p-4 min-w-[280px] animate-fadeIn"
      onMouseLeave={onClose}>
      <h3 className="text-xs font-semibold text-text-primary mb-3">上下文使用情况</h3>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between"><span className="text-text-muted">📥 系统提示</span><span className="text-text-secondary">{stats.systemTokens.toLocaleString()} tokens</span></div>
        <div className="flex justify-between"><span className="text-text-muted">📤 用户消息</span><span className="text-text-secondary">{stats.userTokens.toLocaleString()} tokens</span></div>
        <div className="flex justify-between"><span className="text-text-muted">🤖 AI 回复</span><span className="text-text-secondary">{stats.assistantTokens.toLocaleString()} tokens</span></div>
        <div className="border-t border-hover my-1.5" />
        <div className="flex justify-between font-medium"><span className="text-text-muted">已用</span><span className="text-text-primary">{stats.total.toLocaleString()} tokens</span></div>
        <div className="flex justify-between"><span className="text-text-muted">剩余</span><span className={stats.remaining < 20000 ? 'text-red-400' : 'text-green-400'}>{stats.remaining.toLocaleString()} tokens ({100 - stats.pct}%)</span></div>
        <div className="flex justify-between"><span className="text-text-muted">上限</span><span className="text-text-secondary">{MAX_TOKENS.toLocaleString()} tokens</span></div>
      </div>
      {stats.pct > 85 && (
        <p className="text-[10px] text-yellow-400 mt-2">⚠️ 接近上限，建议开启新会话</p>
      )}
    </div>
  )
}

export function getTokenColor(pct: number): string {
  if (pct > 85) return 'bg-red-500'
  if (pct > 60) return 'bg-yellow-500'
  return 'bg-green-500'
}

export { estimateTokens, MAX_TOKENS }
```

- [ ] **Step 2: Add token bar to StatusBar**

In `src/components/shell/StatusBar.tsx`, add token state and bar:

Add import:
```typescript
import { useState, useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { TokenUsagePopover, getTokenColor, estimateTokens, MAX_TOKENS } from '../chat/TokenUsagePopover'
```

Add state and computation inside the component:
```typescript
const [tokenPopoverOpen, setTokenPopoverOpen] = useState(false)
const messages = useChatStore((s) => activeSessionId ? (s.messagesBySession[activeSessionId] ?? []) : [])

const tokenStats = useMemo(() => {
  let total = 0
  for (const m of messages) total += estimateTokens(m.content)
  return { total, pct: Math.round((total / MAX_TOKENS) * 100) }
}, [messages])
```

Add the token bar JSX in the return, between the spacer and terminal toggle:
```tsx
{/* Token usage bar */}
{activeSessionId && tokenStats.total > 0 && (
  <>
    <div className="relative flex items-center gap-1.5">
      <button
        onClick={() => setTokenPopoverOpen(!tokenPopoverOpen)}
        className="flex items-center gap-1 hover:bg-hover px-1 py-0.5 rounded transition-colors"
        title="上下文使用情况"
      >
        <div className="w-16 h-1.5 bg-hover rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getTokenColor(tokenStats.pct)}`}
            style={{ width: `${Math.min(tokenStats.pct, 100)}%` }}
          />
        </div>
        <span className={`text-[9px] ${tokenStats.pct > 85 ? 'text-red-400' : tokenStats.pct > 60 ? 'text-yellow-400' : 'text-text-muted'}`}>
          {Math.round(tokenStats.total / 1000)}K
        </span>
      </button>
      <TokenUsagePopover isOpen={tokenPopoverOpen} onClose={() => setTokenPopoverOpen(false)} />
    </div>
    <span className="text-text-muted/30">|</span>
  </>
)}
```

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/chat/TokenUsagePopover.tsx src/components/shell/StatusBar.tsx
git commit -m "feat: add token context visualization to StatusBar"
```

---

### Task 6: Create ClusterDashboard Component

**Files:**
- Create: `src/components/panels/ClusterDashboard.tsx`
- Modify: `src/components/shell/StatusBar.tsx` — make agent count clickable

- [ ] **Step 1: Write ClusterDashboard**

```typescript
// src/components/panels/ClusterDashboard.tsx
import { useEffect, useState, useCallback } from 'react'
import { useClusterStore } from '../../stores/clusterStore'

const STATUS_COLORS: Record<string, string> = {
  working: 'bg-green-500',
  idle: 'bg-gray-500',
  error: 'bg-red-500',
  dead: 'bg-red-900',
  restarting: 'bg-yellow-500',
}

const STATUS_LABELS: Record<string, string> = {
  working: '工作', idle: '空闲', error: '异常', dead: '死亡', restarting: '重启中',
}

interface Props {
  onClose: () => void
}

export function ClusterDashboard({ onClose }: Props) {
  const { data, setData } = useClusterStore()
  const [events, setEvents] = useState<Array<{ type: string }>>([])

  const poll = useCallback(async () => {
    try {
      const [state, agents, queue] = await Promise.all([
        window.api.getClusterState(),
        window.api.getClusterAgents(),
        window.api.getClusterQueue(),
      ])
      setData({
        agents: agents || [],
        queueLength: queue?.pending || 0,
        totalCompleted: state?.tasksCompleted || 0,
        totalFailed: state?.tasksFailed || 0,
        isRunning: state?.isRunning || false,
      })
    } catch { /* cluster may not be initialized */ }
  }, [setData])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [poll])

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-surface rounded-2xl shadow-2xl border border-hover p-6 w-[640px] h-[480px] flex items-center justify-center">
          <p className="text-text-muted text-sm">集群未启动</p>
        </div>
      </div>
    )
  }

  const workingCount = data.agents.filter(a => a.status === 'working').length
  const idleCount = data.agents.filter(a => a.status === 'idle').length
  const errorCount = data.agents.filter(a => a.status === 'error' || a.status === 'dead').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-2xl border border-hover overflow-hidden w-[640px] h-[480px] flex flex-col animate-scaleIn">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hover">
          <h3 className="text-sm font-semibold text-text-primary">🤖 Agent 集群仪表盘</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Overview */}
          <div>
            <h4 className="text-[10px] text-text-muted uppercase mb-2">📊 总览</h4>
            <div className="flex gap-2">
              <div className="flex-1 bg-elevated rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-400">{workingCount}</p>
                <p className="text-[10px] text-text-muted">工作中</p>
              </div>
              <div className="flex-1 bg-elevated rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-text-secondary">{idleCount}</p>
                <p className="text-[10px] text-text-muted">空闲</p>
              </div>
              <div className="flex-1 bg-elevated rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-red-400">{errorCount}</p>
                <p className="text-[10px] text-text-muted">异常</p>
              </div>
              <div className="flex-1 bg-elevated rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-primary">{data.queueLength}</p>
                <p className="text-[10px] text-text-muted">排队中</p>
              </div>
            </div>
          </div>

          {/* Agent grid */}
          <div>
            <h4 className="text-[10px] text-text-muted uppercase mb-2">🤖 Agent 列表 ({data.agents.length})</h4>
            <div className="grid grid-cols-4 gap-2">
              {data.agents.map((agent) => (
                <div key={agent.agentId} className="bg-elevated rounded-lg p-2.5 border border-hover">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status] || 'bg-gray-500'}`} />
                    <span className="text-[10px] text-text-secondary truncate">{agent.agentId}</span>
                  </div>
                  <p className="text-[9px] text-text-muted">{agent.role || 'idle'}</p>
                  <div className="flex justify-between mt-1.5 text-[9px]">
                    <span className="text-green-400">{agent.tasksCompleted || 0} done</span>
                    <span className="text-red-400">{agent.tasksFailed || 0} fail</span>
                  </div>
                  {agent.currentTask && (
                    <p className="text-[8px] text-text-muted mt-1 truncate" title={agent.currentTask}>
                      {agent.currentTask.slice(0, 30)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Stats footer */}
          <div className="flex items-center gap-4 text-[10px] text-text-muted border-t border-hover pt-3">
            <span>📈 已完成: {data.totalCompleted}</span>
            <span>⏱ 失败: {data.totalFailed}</span>
            <span>{data.isRunning ? '🟢 运行中' : '⏸ 已暂停'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Make agent count clickable in StatusBar**

In `StatusBar.tsx`, find the agent cluster display section and wrap it in a button:
```tsx
{agentCount > 0 && (
  <>
    <button
      onClick={() => useClusterStore.getState().toggleDashboard()}
      className="text-text-muted flex items-center gap-1 hover:text-text-secondary hover:bg-hover px-1 py-0.5 rounded transition-colors"
      title="点击打开 Agent 仪表盘"
    >
      🤖 {activeAgents}/{agentCount} agents
    </button>
    <span className="text-text-muted/30">|</span>
  </>
)}
```

- [ ] **Step 3: Wire ClusterDashboard in App.tsx**

Add in `src/App.tsx`:
```typescript
import { ClusterDashboard } from './components/panels/ClusterDashboard'
import { useClusterStore } from './stores/clusterStore'

// In App():
const { dashboardOpen, setDashboardOpen } = useClusterStore()

// Add after FeedbackPanel modal:
{dashboardOpen && <ClusterDashboard onClose={() => setDashboardOpen(false)} />}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/panels/ClusterDashboard.tsx src/components/shell/StatusBar.tsx src/App.tsx
git commit -m "feat: add ClusterDashboard with real-time agent grid"
```

---

### Task 7: Create SessionContextMenu Component

**Files:**
- Create: `src/components/panels/SessionContextMenu.tsx`

- [ ] **Step 1: Write SessionContextMenu**

```typescript
// src/components/panels/SessionContextMenu.tsx
import { useEffect, useRef } from 'react'

interface MenuItem {
  label: string
  icon: string
  action: () => void
  danger?: boolean
  separator?: boolean
}

interface Props {
  items: MenuItem[]
  x: number
  y: number
  onClose: () => void
}

export function SessionContextMenu({ items, x, y, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-elevated border border-hover rounded-lg shadow-2xl py-1 min-w-[160px] animate-fadeIn"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator ? (
            <div className="border-t border-hover my-1" />
          ) : (
            <button
              onClick={() => { item.action(); onClose() }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                item.danger
                  ? 'text-red-400 hover:bg-red-400/10'
                  : 'text-text-secondary hover:bg-hover hover:text-text-primary'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/panels/SessionContextMenu.tsx
git commit -m "feat: add SessionContextMenu component"
```

---

### Task 8: Integrate Tags and Pinning into SessionSidebar

**Files:**
- Modify: `src/components/panels/SessionSidebar.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { useCallback, useState } from 'react'  // add useState if not present
import { SessionContextMenu } from './SessionContextMenu'
```

- [ ] **Step 2: Add context menu state and handlers**

```typescript
// State
const [contextMenu, setContextMenu] = useState<{ sessionId: string; x: number; y: number } | null>(null)
const [tagFilter, setTagFilter] = useState<string | null>(null)
const [editingTags, setEditingTags] = useState<string | null>(null)
const [tagInput, setTagInput] = useState('')

// Filtering: prioritize pinned, then filter by tag, then by search
const filteredSessions = useMemo(() => {
  let result = sessions
  if (tagFilter) {
    result = result.filter(s => s.tags?.includes(tagFilter))
  }
  if (search.trim()) {
    const lower = search.toLowerCase()
    result = result.filter(s => s.title.toLowerCase().includes(lower))
  }
  // Sort: pinned first
  return [...result].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
}, [sessions, search, tagFilter])

// Collect all unique tags
const allTags = useMemo(() => {
  const set = new Set<string>()
  sessions.forEach(s => s.tags?.forEach(t => set.add(t)))
  return Array.from(set).sort()
}, [sessions])

// Handlers
async function handleTogglePin(sessionId: string) {
  const session = sessions.find(s => s.id === sessionId)
  if (!session) return
  const newPinned = !session.pinned
  useSessionStore.getState().togglePin(sessionId)
  await window.api.updateSession(sessionId, { pinned: newPinned })
}

async function handleSaveTags(sessionId: string, tags: string[]) {
  useSessionStore.getState().setTags(sessionId, tags)
  await window.api.updateSession(sessionId, { tags })
}

function handleContextMenu(e: React.MouseEvent, sessionId: string) {
  e.preventDefault()
  setContextMenu({ sessionId, x: e.clientX, y: e.clientY })
}

async function handleExport(sessionId: string, format: 'md' | 'json') {
  await window.api.exportSession(sessionId, format)
}
```

- [ ] **Step 3: Add tag filter bar in JSX**

After the search bar, before session list:
```tsx
{/* Tag filter bar */}
{allTags.length > 0 && (
  <div className="px-2 py-1 border-b border-hover flex flex-wrap gap-1">
    <button
      onClick={() => setTagFilter(null)}
      className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
        !tagFilter ? 'bg-primary text-white' : 'bg-hover text-text-muted hover:text-text-secondary'
      }`}
    >
      全部
    </button>
    {allTags.map(tag => (
      <button
        key={tag}
        onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
        className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${
          tagFilter === tag ? 'bg-primary text-white' : 'bg-hover text-text-muted hover:text-text-secondary'
        }`}
      >
        {tag}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 4: Update session card to show pin/tags and context menu**

Replace the session button content with:
```tsx
<button
  key={session.id}
  onClick={() => handleSelectSession(session)}
  onContextMenu={(e) => handleContextMenu(e, session.id)}
  ...
>
  <div className="flex items-center justify-between">
    <span className="text-sm text-text-primary truncate pr-4">
      {session.pinned && <span className="text-yellow-400 mr-1" title="已置顶">📌</span>}
      {session.parentSessionId && <span className="text-text-muted mr-1" title="分支对话">🌿</span>}
      {session.title}
    </span>
    ...
  </div>
  <p className="text-xs text-text-muted mt-1">
    💬 {t('sidebar.messages', { count: session.messageCount })}
    {session.updatedAt && ` · ${new Date(session.updatedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}`}
  </p>
  {session.tags && session.tags.length > 0 && (
    <div className="flex flex-wrap gap-1 mt-1">
      {session.tags.map(tag => (
        <span key={tag} className="px-1 py-0.5 bg-hover rounded text-[9px] text-text-muted">{tag}</span>
      ))}
    </div>
  )}
</button>
```

- [ ] **Step 5: Add context menu JSX at end of return**

```tsx
{/* Context menu */}
{contextMenu && (
  <SessionContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    onClose={() => setContextMenu(null)}
    items={[
      {
        label: sessions.find(s => s.id === contextMenu.sessionId)?.pinned ? '取消置顶' : '📌 置顶',
        icon: '📌',
        action: () => handleTogglePin(contextMenu.sessionId),
      },
      {
        label: '🏷️ 编辑标签',
        icon: '🏷️',
        action: () => setEditingTags(contextMenu.sessionId),
      },
      {
        label: '📤 导出 Markdown',
        icon: '📝',
        action: () => handleExport(contextMenu.sessionId, 'md'),
      },
      {
        label: '📤 导出 JSON',
        icon: '📋',
        action: () => handleExport(contextMenu.sessionId, 'json'),
      },
      { separator: true, label: '', icon: '', action: () => {} },
      {
        label: '🗑️ 删除会话',
        icon: '🗑️',
        action: () => {
          window.api.deleteSession(contextMenu.sessionId)
          useSessionStore.getState().removeSession(contextMenu.sessionId)
        },
        danger: true,
      },
    ]}
  />
)}
```

- [ ] **Step 6: Add tag editing modal**

After the context menu JSX:
```tsx
{/* Tag editor modal */}
{editingTags && (
  <div className="fixed inset-0 z-[110] flex items-center justify-center">
    <div className="fixed inset-0 bg-black/40" onClick={() => setEditingTags(null)} />
    <div className="relative bg-surface rounded-xl shadow-2xl border border-hover p-4 w-[320px] animate-scaleIn">
      <h4 className="text-xs font-semibold text-text-primary mb-3">编辑标签</h4>
      <input
        type="text"
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
            handleSaveTags(editingTags, tags)
            setEditingTags(null)
            setTagInput('')
          }
          if (e.key === 'Escape') { setEditingTags(null); setTagInput('') }
        }}
        placeholder="react, api, debug (逗号分隔)"
        className="w-full bg-elevated border border-hover rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted outline-none focus:border-primary mb-3"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => { setEditingTags(null); setTagInput('') }}
          className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary rounded-lg transition-colors">
          取消
        </button>
        <button onClick={() => {
          const tags = tagInput.split(',').map(t => t.trim()).filter(Boolean)
          handleSaveTags(editingTags, tags)
          setEditingTags(null)
          setTagInput('')
        }}
          className="px-3 py-1.5 bg-primary text-white text-xs rounded-lg hover:opacity-90 transition-opacity">
          保存
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/panels/SessionSidebar.tsx
git commit -m "feat: add tags, pinning, context menu, search to SessionSidebar"
```

---

### Task 9: Create Toast Notification System

**Files:**
- Create: `src/components/ui/Toast.tsx`
- Create: `src/stores/toastStore.ts`

- [ ] **Step 1: Write toastStore**

```typescript
// src/stores/toastStore.ts
import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface ToastState {
  toasts: Toast[]
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  addToast: (message, type = 'success') => {
    const id = crypto.randomUUID()
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }))
    }, 3000)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
```

- [ ] **Step 2: Write Toast component**

```typescript
// src/components/ui/Toast.tsx
import { useToastStore } from '../../stores/toastStore'

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-10 right-4 z-[200] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-2 rounded-lg shadow-lg text-xs animate-fadeIn flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-900/90 text-green-300 border border-green-700' :
            toast.type === 'error' ? 'bg-red-900/90 text-red-300 border border-red-700' :
            'bg-surface text-text-secondary border border-hover'
          }`}
        >
          <span>{toast.message}</span>
          <button onClick={() => removeToast(toast.id)} className="text-text-muted hover:text-text-primary ml-2">✕</button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Wire ToastContainer in App.tsx**

```typescript
import { ToastContainer } from './components/ui/Toast'
// Add <ToastContainer /> before the closing </ErrorBoundary> in App()
```

- [ ] **Step 4: Commit**

```bash
git add src/stores/toastStore.ts src/components/ui/Toast.tsx src/App.tsx
git commit -m "feat: add Toast notification system"
```

---

### Task 10: Wire Export with Toast Feedback

**Files:**
- Modify: `src/components/panels/SessionSidebar.tsx` — update handleExport

- [ ] **Step 1: Update handleExport to use toast**

In SessionSidebar, update the `handleExport` function:
```typescript
async function handleExport(sessionId: string, format: 'md' | 'json') {
  try {
    const result = await window.api.exportSession(sessionId, format)
    if (result?.success) {
      useToastStore.getState().addToast(`✅ 已导出到 ${result.path?.split(/[\\/]/).pop() || '文件'}`, 'success')
    } else {
      useToastStore.getState().addToast(result?.error || '导出失败', 'error')
    }
  } catch {
    useToastStore.getState().addToast('导出失败', 'error')
  }
}
```

Add import:
```typescript
import { useToastStore } from '../../stores/toastStore'
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/panels/SessionSidebar.tsx
git commit -m "feat: wire session export with toast feedback"
```

---

### Task 11: Enhance Search with Content Search

**Files:**
- Modify: `src/components/panels/SessionSidebar.tsx`

- [ ] **Step 1: Add content search capability**

Update the search handler to also search in message content when the query is long enough:
```typescript
// Replace the simple search filter with:
const [searchResults, setSearchResults] = useState<Session[] | null>(null)
const [searching, setSearching] = useState(false)

useEffect(() => {
  if (!search.trim() || search.trim().length < 3) {
    setSearchResults(null)
    return
  }
  const timer = setTimeout(async () => {
    setSearching(true)
    try {
      const results = await window.api.searchSessions(search)
      setSearchResults(results)
    } catch { setSearchResults(null) }
    setSearching(false)
  }, 300)
  return () => clearTimeout(timer)
}, [search])

// Use searchResults if available, otherwise use local filter
const filteredSessions = useMemo(() => {
  const source = search.trim().length >= 3 && searchResults ? searchResults : sessions
  let result = source
  if (tagFilter) {
    result = result.filter(s => s.tags?.includes(tagFilter))
  }
  if (search.trim() && search.trim().length < 3) {
    const lower = search.toLowerCase()
    result = result.filter(s => s.title.toLowerCase().includes(lower))
  }
  return [...result].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
}, [sessions, search, tagFilter, searchResults])
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/components/panels/SessionSidebar.tsx
git commit -m "feat: add content search to session search"
```

---

### Task 12: Final Integration & Smoke Test

**Files:**
- All modified files

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```
Fix any remaining type errors.

- [ ] **Step 2: Run tests**

```bash
npm test
```
Expected: all existing tests pass.

- [ ] **Step 3: Build check**

```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: Phase 2 — final fixes and build verification"
```
