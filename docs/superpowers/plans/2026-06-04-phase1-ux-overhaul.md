# Phase 1 UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Claude Code GUI from IDE-style layout to AI-assistant-first UX with chat-centric layout, modern chat interactions, visual polish, and professional input tools.

**Architecture:** Four independent workstreams that converge in InputArea. Layout refactor removes RightPanel and all tabbed panels (Files/Git/Tasks/Cluster), redistributing their info into StatusBar indicators and chat-inline tools. Chat UX adds 7 message interactions via chatStore + MessageBubble. UI polish is pure CSS + new WelcomeScreen. Input enhancements are 3 new dropdown components injected into InputArea. All changes are additive or removal-only — no core logic rewrites.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Zustand, better-sqlite3, Electron 33

---

### Task 1: Update Type Definitions

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add new types and update existing types**

```typescript
// src/types/index.ts — replace entire file

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  toolCalls?: ToolCall[]
  feedback?: 'up' | 'down' | null  // NEW
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: string
  status: 'running' | 'done' | 'error'
}

export interface Session {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  status: 'active' | 'background' | 'idle'
  parentSessionId?: string   // NEW: for conversation branching
  branchPoint?: string        // NEW: message ID where branch starts
}

export interface StreamState {
  isStreaming: boolean
  abortController: AbortController | null
}

// Removed PanelTab — no longer needed
export type Theme = 'dark' | 'light'

export interface PanelLayout {
  sidebarOpen: boolean
  sidebarWidth: number
  // REMOVED: rightPanelOpen, rightPanelWidth, rightPanelTab
  bottomPanelOpen: boolean
  bottomPanelHeight: number
  settingsOpen: boolean
  feedbackOpen: boolean
}

// NEW types
export interface PromptTemplate {
  id: string
  title: string
  prompt: string
  icon: string
}

export interface FeedbackRecord {
  messageId: string
  sessionId: string
  rating: 'up' | 'down'
  timestamp: string
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors related to the changed types (other pre-existing errors OK if they were there before).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: update types for Phase 1 UX — add feedback, branching, templates; remove PanelTab"
```

---

### Task 2: Simplify panelStore

**Files:**
- Modify: `src/stores/panelStore.ts`

- [ ] **Step 1: Rewrite panelStore — remove right panel state**

```typescript
// src/stores/panelStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PanelLayout } from '../types'

interface PanelState extends PanelLayout {
  toggleSidebar: () => void
  toggleBottomPanel: () => void
  toggleSettings: () => void
  toggleFeedback: () => void
  setSidebarWidth: (w: number) => void
  setBottomPanelHeight: (h: number) => void
}

export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarWidth: 240,
      bottomPanelOpen: false,
      bottomPanelHeight: 200,
      settingsOpen: false,
      feedbackOpen: false,

      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      toggleBottomPanel: () => set((s) => ({ bottomPanelOpen: !s.bottomPanelOpen })),
      toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
      toggleFeedback: () => set((s) => ({ feedbackOpen: !s.feedbackOpen })),
      setSidebarWidth: (w) => set({ sidebarWidth: w }),
      setBottomPanelHeight: (h) => set({ bottomPanelHeight: h }),
    }),
    { name: 'panel-layout', version: 2 }  // bump version for migration
  )
)
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/stores/panelStore.ts
git commit -m "refactor: simplify panelStore — remove right panel state (Phase 1)"
```

---

### Task 3: Remove Panel Components

**Files:**
- Remove: `src/components/panels/FilesPanel.tsx`
- Remove: `src/components/panels/GitPanel.tsx`
- Remove: `src/components/panels/TasksPanel.tsx`
- Remove: `src/components/panels/ClusterPanel.tsx`
- Modify: `src/components/panels/RightPanel.tsx` → gut to empty shell
- Modify: `src/components/panels/MainPanel.tsx`

- [ ] **Step 1: Gut RightPanel — return null, keep file as placeholder**

```typescript
// src/components/panels/RightPanel.tsx
// Right panel removed in Phase 1 UX overhaul.
// File/git/tasks/cluster functionality migrated to StatusBar + chat-inline tools.
export function RightPanel() {
  return null
}
```

- [ ] **Step 2: Remove the 4 panel component files**

Run:
```bash
rm src/components/panels/FilesPanel.tsx
rm src/components/panels/GitPanel.tsx
rm src/components/panels/TasksPanel.tsx
rm src/components/panels/ClusterPanel.tsx
```

- [ ] **Step 3: Verify no remaining imports reference deleted files**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors about missing FilesPanel/GitPanel/TasksPanel/ClusterPanel modules.

- [ ] **Step 4: Commit**

```bash
git add src/components/panels/
git commit -m "refactor: remove right panel and sub-panels (Phase 1 layout)"
```

---

### Task 4: Simplify AppShell — Remove Right Panel Slot

**Files:**
- Modify: `src/components/shell/AppShell.tsx`

- [ ] **Step 1: Rewrite AppShell removing rightPanel props and DOM**

```typescript
// src/components/shell/AppShell.tsx
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { TitleBar } from './TitleBar'
import { StatusBar } from './StatusBar'
import { TrialBanner } from '../../renderer/components/auth/TrialBanner'
import { LoginModal } from '../../renderer/components/auth/LoginModal'

interface Props {
  sidebar: ReactNode
  main: ReactNode
  bottomPanel?: ReactNode
  sidebarWidth: number
  bottomPanelHeight: number
  bottomPanelOpen: boolean
  onResizeSidebar: (w: number) => void
  onResizeBottomPanel: (h: number) => void
}

const MIN_SIDEBAR = 160
const MAX_SIDEBAR = 480
const MIN_BOTTOM = 100
const MAX_BOTTOM = 500

function useDragResize(
  onResize: (delta: number) => void,
  minSize: number,
  maxSize: number,
  currentSize: number,
  direction: 'horizontal' | 'vertical'
) {
  const dragging = useRef(false)
  const startPos = useRef(0)
  const startSize = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY
    startSize.current = currentSize
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }, [direction, currentSize])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      const pos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = direction === 'horizontal' ? pos - startPos.current : startPos.current - pos
      const newSize = Math.min(maxSize, Math.max(minSize, startSize.current + delta))
      onResize(newSize)
    }

    function onMouseUp() {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onResize, minSize, maxSize, direction])

  return { onMouseDown }
}

export function AppShell({
  sidebar,
  main,
  bottomPanel,
  sidebarWidth,
  bottomPanelOpen,
  bottomPanelHeight,
  onResizeSidebar,
  onResizeBottomPanel,
}: Props) {
  const [isMac, setIsMac] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  useEffect(() => { setIsMac(navigator.platform.toLowerCase().includes('mac')) }, [])

  const sidebarResize = useDragResize(onResizeSidebar, MIN_SIDEBAR, MAX_SIDEBAR, sidebarWidth, 'horizontal')
  const bottomResize = useDragResize(onResizeBottomPanel, MIN_BOTTOM, MAX_BOTTOM, bottomPanelHeight, 'vertical')

  return (
    <div className="flex flex-col h-screen bg-base">
      {isMac && <TitleBar />}

      <TrialBanner onLogin={() => setLoginOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex-shrink-0 border-r border-hover overflow-hidden transition-all duration-200 ease-out"
          style={{ width: `${sidebarWidth}px` }}
        >
          {sidebar}
        </div>

        {/* Sidebar resize handle */}
        <div
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
          onMouseDown={sidebarResize.onMouseDown}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {main}
          </div>

          {bottomPanelOpen && bottomPanel && (
            <>
              {/* Bottom panel resize handle */}
              <div
                className="h-1 flex-shrink-0 cursor-row-resize hover:bg-primary/50 active:bg-primary transition-colors z-10"
                onMouseDown={bottomResize.onMouseDown}
              />
              <div
                className="flex-shrink-0 border-t border-hover overflow-hidden transition-all duration-200 ease-out"
                style={{ height: `${bottomPanelHeight}px` }}
              >
                {bottomPanel}
              </div>
            </>
          )}
        </div>
      </div>

      <StatusBar />

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoginSuccess={() => {
          window.api.getLicenseStatus().then(() => {}).catch(() => {})
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/AppShell.tsx
git commit -m "refactor: remove right panel slot from AppShell (Phase 1 layout)"
```

---

### Task 5: Update App.tsx — Simplified Layout

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Remove RightPanel and right-panel-related props**

```typescript
// src/App.tsx
import { AppShell } from './components/shell/AppShell'
import { SessionSidebar } from './components/panels/SessionSidebar'
import { MainPanel } from './components/panels/MainPanel'
import { BottomPanel } from './components/panels/BottomPanel'
import { SettingsPanel } from './components/panels/SettingsPanel'
import { FeedbackPanel } from './components/panels/FeedbackPanel'
import { CommandPalette } from './components/command/CommandPalette'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { usePanelStore } from './stores/panelStore'
import { useKeyboard } from './hooks/useKeyboard'
import { useTheme } from './hooks/useTheme'

export default function App() {
  useTheme()
  useKeyboard()

  const {
    sidebarOpen, sidebarWidth,
    bottomPanelOpen, bottomPanelHeight,
    settingsOpen, toggleSettings,
    feedbackOpen, toggleFeedback,
    setSidebarWidth, setBottomPanelHeight,
  } = usePanelStore()

  return (
    <ErrorBoundary name="AppRoot">
      <AppShell
        sidebar={
          <ErrorBoundary name="Sidebar">
            <SessionSidebar />
          </ErrorBoundary>
        }
        main={
          <ErrorBoundary name="MainPanel">
            <MainPanel />
          </ErrorBoundary>
        }
        bottomPanel={
          <ErrorBoundary name="BottomPanel">
            <BottomPanel />
          </ErrorBoundary>
        }
        sidebarWidth={sidebarOpen ? sidebarWidth : 0}
        bottomPanelOpen={bottomPanelOpen}
        bottomPanelHeight={bottomPanelHeight}
        onResizeSidebar={setSidebarWidth}
        onResizeBottomPanel={setBottomPanelHeight}
      />
      <ErrorBoundary name="CommandPalette">
        <CommandPalette />
      </ErrorBoundary>

      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%]">
          <div className="fixed inset-0 bg-black/40" onClick={toggleSettings} />
          <div className="relative w-[540px] h-[480px] bg-elevated rounded-2xl shadow-2xl border border-hover overflow-hidden animate-scaleIn">
            <ErrorBoundary name="SettingsPanel">
              <SettingsPanel onClose={toggleSettings} />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {feedbackOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%]">
          <div className="fixed inset-0 bg-black/40" onClick={toggleFeedback} />
          <div className="relative w-[480px] h-[380px] bg-elevated rounded-2xl shadow-2xl border border-hover overflow-hidden animate-scaleIn">
            <ErrorBoundary name="FeedbackPanel">
              <FeedbackPanel onClose={toggleFeedback} />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </ErrorBoundary>
  )
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: simplify App.tsx — remove RightPanel, add modal animations"
```

---

### Task 6: Redesign StatusBar as Information Dashboard

**Files:**
- Modify: `src/components/shell/StatusBar.tsx`

- [ ] **Step 1: Rewrite StatusBar**

```typescript
// src/components/shell/StatusBar.tsx
import { useI18n } from '../../i18n'
import { usePanelStore } from '../../stores/panelStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useEffect, useState } from 'react'
import type { LicenseStatus } from '../../types/license'

export function StatusBar() {
  const { t } = useI18n()
  const toggleBottomPanel = usePanelStore((s) => s.toggleBottomPanel)
  const bottomPanelOpen = usePanelStore((s) => s.bottomPanelOpen)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const [nodeCount, setNodeCount] = useState(0)
  const [agentCount, setAgentCount] = useState(0)
  const [activeAgents, setActiveAgents] = useState(0)
  const [license, setLicense] = useState<LicenseStatus | null>(null)
  const [gitInfo, setGitInfo] = useState<{ branch: string; changes: number }>({ branch: '', changes: 0 })
  const [connected, setConnected] = useState(false)

  // Poll knowledge stats
  useEffect(() => {
    const poll = () => {
      window.api.getKnowledgeStats().then((s: { nodeCount: number }) => {
        setNodeCount(s.nodeCount)
      }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [])

  // Poll agent stats
  useEffect(() => {
    const poll = () => {
      window.api.getClusterAgents?.().then((agents: Array<{ status: string }>) => {
        if (agents) {
          setAgentCount(agents.length)
          setActiveAgents(agents.filter(a => a.status === 'working').length)
        }
      }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [])

  // Poll git status
  useEffect(() => {
    const poll = () => {
      window.api.gitStatus?.().then((s: { branch?: string; files?: Array<unknown> }) => {
        setGitInfo({
          branch: s.branch || '',
          changes: s.files?.length || 0,
        })
      }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 15000)
    return () => clearInterval(interval)
  }, [])

  // Poll license status
  useEffect(() => {
    const poll = () => {
      window.api.getLicenseStatus().then(setLicense).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [])

  // Connection status
  useEffect(() => {
    setConnected(!!activeSessionId)
  }, [activeSessionId])

  return (
    <div className="flex items-center h-7 bg-surface border-t border-hover px-3 text-[10px] gap-2 select-none">
      {/* Connection status */}
      <span className={`flex items-center gap-1 ${connected ? 'text-success' : 'text-text-muted'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success' : 'bg-gray-500'}`} />
        {connected ? '已连接' : '就绪'}
      </span>

      <span className="text-text-muted/30">|</span>

      {/* Agent cluster */}
      {agentCount > 0 && (
        <>
          <span className="text-text-muted flex items-center gap-1">
            🤖 {activeAgents}/{agentCount} agents
          </span>
          <span className="text-text-muted/30">|</span>
        </>
      )}

      {/* Knowledge graph */}
      {nodeCount > 0 && (
        <>
          <span className="text-text-muted flex items-center gap-1">
            🧠 {nodeCount} 知识点
          </span>
          <span className="text-text-muted/30">|</span>
        </>
      )}

      {/* Git */}
      {gitInfo.branch && (
        <>
          <span className="text-text-muted flex items-center gap-1">
            🔀 {gitInfo.branch}
            {gitInfo.changes > 0 && (
              <span className="text-yellow-400">·{gitInfo.changes} files</span>
            )}
          </span>
          <span className="text-text-muted/30">|</span>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Terminal toggle */}
      <button
        onClick={toggleBottomPanel}
        title="终端 (Ctrl+`)"
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
          bottomPanelOpen
            ? 'bg-active text-primary'
            : 'text-text-muted hover:text-text-secondary hover:bg-hover'
        }`}
      >
        <span className="text-xs">💻</span>
        <span>终端</span>
      </button>

      <span className="text-text-muted/30">|</span>

      {/* License tier */}
      {license && (
        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
          license.tier === 'pro' || license.tier === 'enterprise'
            ? 'bg-purple-500/20 text-purple-300'
            : 'text-text-muted'
        }`}>
          {license.trial ? '🧪 试用中' : license.tier === 'pro' ? '⭐ Pro' : license.tier === 'enterprise' ? '🏢 企业' : '免费版'}
        </span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update preload to expose gitStatus and getClusterAgents**

Add in `src/preload/index.ts` (the preload bridge):
```typescript
// Add these API methods
gitStatus: () => ipcRenderer.invoke('git:status'),
getClusterAgents: () => ipcRenderer.invoke('cluster:agents'),
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/shell/StatusBar.tsx src/preload/index.ts
git commit -m "feat: redesign StatusBar as information dashboard (Phase 1)"
```

---

### Task 7: Update chatStore — Edit, Regenerate, Branch, Feedback

**Files:**
- Modify: `src/stores/chatStore.ts`

- [ ] **Step 1: Add new methods to chatStore**

```typescript
// src/stores/chatStore.ts
import { create } from 'zustand'
import type { Message, StreamState } from '../types'

interface ChatState {
  messagesBySession: Record<string, Message[]>
  streamBySession: Record<string, StreamState>
  streamingText: Record<string, string>

  setMessages: (sessionId: string, messages: Message[]) => void
  addMessage: (sessionId: string, message: Message) => void
  appendToStream: (sessionId: string, chunk: string) => void
  commitStream: (sessionId: string, message: Message) => void
  setStreaming: (sessionId: string, isStreaming: boolean) => void
  clearStream: (sessionId: string) => void

  // NEW: edit, regenerate, branch, feedback
  editMessage: (sessionId: string, messageId: string, newContent: string) => void
  removeLastAssistantMessage: (sessionId: string) => void
  truncateAfterMessage: (sessionId: string, messageId: string) => Message[]
  setMessageFeedback: (sessionId: string, messageId: string, feedback: 'up' | 'down') => void
}

export const useChatStore = create<ChatState>()((set, get) => ({
  messagesBySession: {},
  streamBySession: {},
  streamingText: {},

  setMessages: (sessionId, messages) =>
    set((s) => ({
      messagesBySession: { ...s.messagesBySession, [sessionId]: messages }
    })),

  addMessage: (sessionId, message) =>
    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] ?? []), message]
      }
    })),

  appendToStream: (sessionId, chunk) =>
    set((s) => ({
      streamingText: {
        ...s.streamingText,
        [sessionId]: (s.streamingText[sessionId] ?? '') + chunk
      }
    })),

  commitStream: (sessionId, message) =>
    set((s) => ({
      messagesBySession: {
        ...s.messagesBySession,
        [sessionId]: [...(s.messagesBySession[sessionId] ?? []), message]
      },
      streamingText: { ...s.streamingText, [sessionId]: '' }
    })),

  setStreaming: (sessionId, isStreaming) =>
    set((s) => ({
      streamBySession: {
        ...s.streamBySession,
        [sessionId]: { ...(s.streamBySession[sessionId] ?? { abortController: null }), isStreaming }
      }
    })),

  clearStream: (sessionId) =>
    set((s) => ({
      streamingText: { ...s.streamingText, [sessionId]: '' },
      streamBySession: {
        ...s.streamBySession,
        [sessionId]: { abortController: null, isStreaming: false }
      }
    })),

  // NEW methods
  editMessage: (sessionId, messageId, newContent) =>
    set((s) => {
      const msgs = s.messagesBySession[sessionId] ?? []
      const idx = msgs.findIndex(m => m.id === messageId)
      if (idx === -1) return s
      const updated = [...msgs]
      updated[idx] = { ...updated[idx], content: newContent }
      return {
        messagesBySession: { ...s.messagesBySession, [sessionId]: updated }
      }
    }),

  removeLastAssistantMessage: (sessionId) =>
    set((s) => {
      const msgs = s.messagesBySession[sessionId] ?? []
      // Find and remove the last assistant message
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          return {
            messagesBySession: {
              ...s.messagesBySession,
              [sessionId]: [...msgs.slice(0, i), ...msgs.slice(i + 1)]
            }
          }
        }
      }
      return s
    }),

  truncateAfterMessage: (sessionId, messageId) => {
    const msgs = get().messagesBySession[sessionId] ?? []
    const idx = msgs.findIndex(m => m.id === messageId)
    if (idx === -1) return msgs
    const truncated = msgs.slice(0, idx + 1)
    set((s) => ({
      messagesBySession: { ...s.messagesBySession, [sessionId]: truncated }
    }))
    return truncated
  },

  setMessageFeedback: (sessionId, messageId, feedback) =>
    set((s) => {
      const msgs = s.messagesBySession[sessionId] ?? []
      const idx = msgs.findIndex(m => m.id === messageId)
      if (idx === -1) return s
      const updated = [...msgs]
      updated[idx] = { ...updated[idx], feedback }
      return {
        messagesBySession: { ...s.messagesBySession, [sessionId]: updated }
      }
    }),
}))
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/stores/chatStore.ts
git commit -m "feat: add edit, regenerate, branch, feedback methods to chatStore"
```

---

### Task 8: Add Feedback & Branching DB Support

**Files:**
- Modify: `src/main/db.ts`

- [ ] **Step 1: Add message_feedback table and session columns**

In `initTables()`, add after the messages table creation, before the knowledge graph section:

```typescript
// in the db.exec(`...`) string, add after CREATE TABLE messages:

// Message feedback
db.exec(`
  CREATE TABLE IF NOT EXISTS message_feedback (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    rating TEXT NOT NULL CHECK(rating IN ('up', 'down')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_message ON message_feedback(message_id);
`)

// Add parent_session_id and branch_point to sessions
// Use a safe migration: try adding columns, ignore if they already exist
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN parent_session_id TEXT`)
} catch { /* column already exists */ }
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN branch_point TEXT`)
} catch { /* column already exists */ }
```

- [ ] **Step 2: Update SessionRow interface**

Add to the SessionRow interface:
```typescript
export interface SessionRow {
  id: string
  title: string
  created_at: string
  updated_at: string
  message_count: number
  status: string
  parent_session_id?: string | null  // NEW
  branch_point?: string | null       // NEW
}
```

- [ ] **Step 3: Update rowToSession in ipc.ts to map new columns**

In `src/main/ipc.ts`, update the `rowToSession` function:
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
  }
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/main/db.ts src/main/ipc.ts
git commit -m "feat: add message_feedback table and session branching columns"
```

---

### Task 9: Enhance MessageBubble — Actions, Timestamps, Feedback

**Files:**
- Modify: `src/components/chat/MessageBubble.tsx`

- [ ] **Step 1: Rewrite MessageBubble with all new interactions**

```typescript
// src/components/chat/MessageBubble.tsx
import { useMemo, memo, useState, useCallback } from 'react'
import { useI18n } from '../../i18n'
import type { Message } from '../../types'
import { Marked } from 'marked'
import { CodeBlock } from './CodeBlock'
import { StreamingDot } from './ThinkingIndicator'
import { useChatStore } from '../../stores/chatStore'
import { useSessionStore } from '../../stores/sessionStore'

const marked = new Marked()

interface Props {
  message: Message
  onEdit?: (message: Message) => void
  onBranch?: (message: Message) => void
}

interface ContentPart {
  type: 'text' | 'code'
  content: string
  language?: string
}

function parseContent(content: string): ContentPart[] {
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g
  const parts: ContentPart[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) })
    }
    parts.push({ type: 'code', language: match[1] || undefined, content: match[2].trim() })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) })
  }

  return parts
}

function RenderedMarkdown({ content }: { content: string }) {
  const html = useMemo(() => {
    const parsed = marked.parse(content)
    return typeof parsed === 'string' ? parsed : ''
  }, [content])

  return (
    <div
      className="markdown-body prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  const month = d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  return `${month} ${time}`
}

export const MessageBubble = memo(function MessageBubble({ message, onEdit, onBranch }: Props) {
  const { t } = useI18n()
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const isStreaming = message.id === 'streaming'
  const parts = parseContent(message.content || '')
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)

  const setMessageFeedback = useChatStore((s) => s.setMessageFeedback)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)

  const handleCopy = useCallback(async () => {
    try {
      await window.api.copyToClipboard(message.content)
    } catch {
      navigator.clipboard.writeText(message.content)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const handleFeedback = useCallback((rating: 'up' | 'down') => {
    if (!activeSessionId) return
    setMessageFeedback(activeSessionId, message.id, rating)
  }, [activeSessionId, message.id, setMessageFeedback])

  const timestamp = formatTime(message.createdAt)

  // System messages: centered, compact, subtle
  if (isSystem) {
    return (
      <div className="flex justify-center mb-3 animate-fadeIn">
        <div className="max-w-[85%] rounded-xl px-4 py-2 text-xs message-content bg-active/50 border border-hover text-text-secondary">
          {parts.map((part, i) =>
            part.type === 'code' ? (
              <CodeBlock key={i} language={part.language} code={part.content} />
            ) : (
              <RenderedMarkdown key={i} content={part.content} />
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex gap-3 mb-4 ${isUser ? 'flex-row-reverse' : ''} animate-fadeIn group`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
          isUser ? 'bg-gray-600 text-gray-300' : 'bg-primary text-white'
        }`}
      >
        {isUser ? t('chat.userAvatar') : isStreaming ? (
          <span className="relative">
            🤖
            <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30" />
          </span>
        ) : '🤖'}
      </div>

      {/* Bubble */}
      <div className="flex flex-col max-w-[80%]">
        <div
          className={`rounded-2xl px-4 py-3 text-sm message-content ${
            isUser
              ? 'bg-active text-text-primary'
              : 'bg-hover text-text-primary'
          }`}
        >
          {parts.length > 0 ? (
            parts.map((part, i) =>
              part.type === 'code' ? (
                <CodeBlock key={i} language={part.language} code={part.content} />
              ) : (
                <RenderedMarkdown key={i} content={part.content} />
              )
            )
          ) : (
            <span className="text-text-muted italic">Thinking...</span>
          )}
          {isStreaming && <StreamingDot />}
        </div>

        {/* Timestamp */}
        <span className={`text-[10px] text-text-muted mt-0.5 ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
          {timestamp}
        </span>

        {/* Action bar — shown on hover for assistant messages */}
        {!isUser && !isStreaming && !isSystem && (
          <div className={`flex items-center gap-1 ml-1 mt-1 transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
            <button
              onClick={handleCopy}
              className="text-[10px] text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded hover:bg-hover transition-colors"
              title="复制"
            >
              {copied ? '✓ 已复制' : '📋'}
            </button>
            <button
              onClick={() => onEdit?.(message)}
              className="text-[10px] text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded hover:bg-hover transition-colors"
              title="重新生成"
            >
              🔄
            </button>
            <button
              onClick={() => handleFeedback('up')}
              className={`text-[10px] px-1 py-0.5 rounded transition-colors ${
                message.feedback === 'up' ? 'text-green-400' : 'text-text-muted hover:text-green-400'
              }`}
              title="有用"
            >
              👍
            </button>
            <button
              onClick={() => handleFeedback('down')}
              className={`text-[10px] px-1 py-0.5 rounded transition-colors ${
                message.feedback === 'down' ? 'text-red-400' : 'text-text-muted hover:text-red-400'
              }`}
              title="没用"
            >
              👎
            </button>
            <button
              onClick={() => onBranch?.(message)}
              className="text-[10px] text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded hover:bg-hover transition-colors"
              title="从此处分支"
            >
              🌿
            </button>
          </div>
        )}

        {/* Edit button for user messages — shown on hover */}
        {isUser && !isStreaming && (
          <div className={`flex justify-end mt-1 mr-1 transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
            <button
              onClick={() => onEdit?.(message)}
              className="text-[10px] text-text-muted hover:text-text-secondary px-1.5 py-0.5 rounded hover:bg-hover transition-colors"
              title="编辑"
            >
              ✏️ 编辑
            </button>
          </div>
        )}
      </div>
    </div>
  )
})
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/MessageBubble.tsx
git commit -m "feat: add timestamps, hover actions, copy, feedback, edit, branch to MessageBubble"
```

---

### Task 10: Update InputArea — Edit Support

**Files:**
- Modify: `src/components/chat/InputArea.tsx`

- [ ] **Step 1: Add edit mode and regenerate support**

Add these changes to InputArea:

```typescript
// Add state near the top of InputArea component:
const [editingMessageId, setEditingMessageId] = useState<string | null>(null)

// Add handler for editing messages (called from MessageBubble via ChatView):
const handleEditMessage = useCallback((message: Message) => {
  setInput(message.content)
  setEditingMessageId(message.id)
}, [])

// Add handler for regenerating (called from onEdit in MessageBubble for assistant msgs):
const handleRegenerate = useCallback(async () => {
  if (!activeSessionId) return
  const msgs = useChatStore.getState().messagesBySession[activeSessionId] ?? []
  // Remove last assistant message, then resend
  useChatStore.getState().removeLastAssistantMessage(activeSessionId)
  // Resend the last user message
  const updatedMsgs = useChatStore.getState().messagesBySession[activeSessionId] ?? []
  const lastUserMsg = [...updatedMsgs].reverse().find(m => m.role === 'user')
  if (lastUserMsg) {
    setStreaming(activeSessionId, true)
    try {
      await window.api.sendMessage({
        sessionId: activeSessionId,
        messages: updatedMsgs.map((m) => ({ role: m.role, content: m.content }))
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('input.error')
      setError(msg)
      clearStream(activeSessionId)
      setStreaming(activeSessionId, false)
    }
  }
}, [activeSessionId])

// In the handleSend function, after sending, clear editing state:
// Add: setEditingMessageId(null)
// Also, if editingMessageId is set, update the existing message instead of adding a new one:
// (the sending logic stays the same — just treat it as a new message after the edit point)

// Pass handleEditMessage, handleRegenerate up through ChatView
```

- [ ] **Step 2: Modify the send button visual when editing**

Replace the send button section:
```tsx
{isStreaming ? (
  <button
    onClick={handleAbort}
    disabled={aborting}
    className="px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-500 disabled:opacity-40 transition-all flex-shrink-0 flex items-center gap-1.5"
  >
    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
    {aborting ? '停止中...' : '停止'}
  </button>
) : (
  <button
    onClick={handleSend}
    disabled={(!input.trim() && files.length === 0) || isStreaming}
    className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
  >
    {editingMessageId ? '更新' : '发送'}
  </button>
)}
```

- [ ] **Step 3: Add Esc to cancel edit**

In `handleKeyDown`:
```typescript
if (e.key === 'Escape' && editingMessageId) {
  e.preventDefault()
  setInput('')
  setEditingMessageId(null)
  return
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/InputArea.tsx
git commit -m "feat: add edit message and regenerate support to InputArea"
```

---

### Task 11: Wire ChatView — Connect Edit/Regenerate/Branch

**Files:**
- Modify: `src/components/chat/ChatView.tsx`

- [ ] **Step 1: Rewrite ChatView to connect new MessageBubble props**

```typescript
// src/components/chat/ChatView.tsx
import { useEffect, useRef, useMemo, useCallback } from 'react'
import { useI18n } from '../../i18n'
import { useSessionStore } from '../../stores/sessionStore'
import { useChatStore } from '../../stores/chatStore'
import { MessageBubble } from './MessageBubble'
import { ThinkingIndicator } from './ThinkingIndicator'
import { VirtualMessageList } from './VirtualMessageList'
import { WelcomeScreen } from '../ui/WelcomeScreen'
import type { Message } from '../../types'

const TASK_ICONS: Record<string, string> = {
  research: '🔍',
  'code-gen': '⚡',
  'code-review': '👁',
  'memory-extract': '🧠',
  evolution: '🔄',
  verify: '✅',
  'monitor-check': '📡',
  decompose: '📋',
  synthesize: '🧩',
}

const EMPTY_MSGS: Message[] = []

export function ChatView() {
  const { t } = useI18n()
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const addSession = useSessionStore((s) => s.addSession)

  const messagesBySession = useChatStore((s) => s.messagesBySession)
  const streamingTextBySession = useChatStore((s) => s.streamingText)
  const streamBySession = useChatStore((s) => s.streamBySession)
  const addMessage = useChatStore((s) => s.addMessage)
  const truncateAfterMessage = useChatStore((s) => s.truncateAfterMessage)
  const setMessages = useChatStore((s) => s.setMessages)

  const messages = useMemo(() =>
    activeSessionId ? (messagesBySession[activeSessionId] ?? EMPTY_MSGS) : EMPTY_MSGS,
    [activeSessionId, messagesBySession]
  )
  const streamingText = useMemo(() =>
    activeSessionId ? (streamingTextBySession[activeSessionId] ?? '') : '',
    [activeSessionId, streamingTextBySession]
  )
  const isStreaming = useMemo(() =>
    activeSessionId ? (streamBySession[activeSessionId]?.isStreaming ?? false) : false,
    [activeSessionId, streamBySession]
  )
  const activeSessionRef = useRef(activeSessionId)
  activeSessionRef.current = activeSessionId

  // Listen for agent cluster results
  useEffect(() => {
    if (typeof window.api?.onClusterResult !== 'function') return
    const cleanup = window.api.onClusterResult((data) => {
      const sid = activeSessionRef.current
      if (!sid) return

      const icon = data.taskType ? (TASK_ICONS[data.taskType] || '🤖') : '🤖'
      const content = data.success
        ? `${icon} **Agent 集群任务完成** (${data.taskType || 'unknown'})\n\n${data.output || ''}`
        : `${icon} **Agent 集群任务失败**\n\n${data.error || '未知错误'}`

      const msg: Message = {
        id: `cluster_${data.taskId}_${Date.now()}`,
        sessionId: sid,
        role: 'system',
        content,
        createdAt: new Date().toISOString(),
      }
      addMessage(sid, msg)
    })
    return () => { cleanup() }
  }, [addMessage])

  // Handle message edit (for user messages)
  const handleEdit = useCallback((message: Message) => {
    // Truncate history at this message, then the InputArea will handle refilling
    if (activeSessionRef.current) {
      truncateAfterMessage(activeSessionRef.current, message.id)
    }
  }, [truncateAfterMessage])

  // Handle conversation branching
  const handleBranch = useCallback(async (message: Message) => {
    const sid = activeSessionRef.current
    if (!sid) return

    // Create new session branching from this point
    const msgs = messagesBySession[sid] ?? []
    const idx = msgs.findIndex(m => m.id === message.id)
    if (idx === -1) return

    const branchHistory = msgs.slice(0, idx + 1)

    // Create new session via IPC
    const newSession = await window.api.createSession('分支对话')
    addSession(newSession)

    // Copy history into new session
    for (const msg of branchHistory) {
      setMessages(newSession.id, branchHistory)
      try {
        await window.api.saveMessage(newSession.id, msg)
      } catch { /* best-effort */ }
    }
  }, [messagesBySession, addSession, setMessages])

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-base">
        <WelcomeScreen />
      </div>
    )
  }

  const hasMessages = messages.length > 0
  const hasStreamingContent = isStreaming || streamingText
  const showEmpty = !hasMessages && !hasStreamingContent

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-4 pt-6">
      {showEmpty && (
        <div className="flex-1 flex items-center justify-center">
          <WelcomeScreen />
        </div>
      )}

      {hasMessages && (
        <div className="flex-1 min-h-0">
          <VirtualMessageList
            messages={messages}
            onEdit={handleEdit}
            onBranch={handleBranch}
          />
        </div>
      )}

      {/* Thinking animation */}
      {isStreaming && !streamingText && (
        <div className="flex-shrink-0">
          <ThinkingIndicator />
        </div>
      )}

      {streamingText && (
        <div className="flex-shrink-0">
          <MessageBubble
            message={{
              id: 'streaming',
              sessionId: activeSessionId,
              role: 'assistant',
              content: streamingText,
              createdAt: new Date().toISOString()
            }}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Note: Will fail until WelcomeScreen and updated VirtualMessageList are created — that's expected, fix in next tasks.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatView.tsx
git commit -m "feat: wire edit, regenerate, branch interactions in ChatView"
```

---

### Task 12: Update VirtualMessageList — Pass Callbacks

**Files:**
- Modify: `src/components/chat/VirtualMessageList.tsx`

- [ ] **Step 1: Add callback props and pass through to MessageBubble**

```typescript
// src/components/chat/VirtualMessageList.tsx
import { memo } from 'react'
import { MessageBubble } from './MessageBubble'
import type { Message } from '../../types'

interface Props {
  messages: Message[]
  onEdit?: (message: Message) => void
  onBranch?: (message: Message) => void
}

export const VirtualMessageList = memo(function VirtualMessageList({
  messages,
  onEdit,
  onBranch,
}: Props) {
  return (
    <div className="space-y-0">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onEdit={onEdit}
          onBranch={onBranch}
        />
      ))}
    </div>
  )
})
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/VirtualMessageList.tsx
git commit -m "feat: pass edit/branch callbacks through VirtualMessageList"
```

---

### Task 13: Streaming Animation Improvements

**Files:**
- Modify: `src/components/chat/ThinkingIndicator.tsx`

- [ ] **Step 1: Simplify ThinkingIndicator, keep the existing animation but add smooth scroll**

The current ThinkingIndicator is already visually rich. We just need to add a CSS keyframe for the existing `node-blink` and `agent-slide` animations that may be missing from global CSS. Add to `src/renderer/index.html` or a CSS file:

```css
/* Add in src/renderer/index.html <style> tag or a new global.css */
@keyframes node-blink {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

@keyframes agent-slide {
  0% { transform: translateX(-20px); opacity: 0.2; }
  50% { opacity: 0.6; }
  100% { transform: translateX(20px); opacity: 0.2; }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* Smooth auto-scroll */
.smooth-scroll {
  scroll-behavior: smooth;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Add Tailwind animation utilities**

In `tailwind.config.ts`, add:
```typescript
extend: {
  // ... existing extend
  animation: {
    'fadeIn': 'fadeIn 150ms ease-out',
    'scaleIn': 'scaleIn 200ms ease-out',
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ThinkingIndicator.tsx src/renderer/index.html tailwind.config.ts
git commit -m "feat: add CSS keyframe animations, reduced-motion support"
```

---

### Task 14: Create WelcomeScreen Component

**Files:**
- Create: `src/components/ui/WelcomeScreen.tsx`

- [ ] **Step 1: Write WelcomeScreen**

```typescript
// src/components/ui/WelcomeScreen.tsx
import { useSessionStore } from '../../stores/sessionStore'
import { useI18n } from '../../i18n'

const QUICK_STARTS = [
  { icon: '🔍', text: '帮我审查这段代码', prompt: '请帮我审查以下代码的质量、安全性和性能：' },
  { icon: '📝', text: '生成 API 文档', prompt: '请为以下代码生成完整的 API 文档：' },
  { icon: '🐛', text: '帮我 Debug 一个 Bug', prompt: '我遇到了一个 bug，请帮我分析和修复：' },
  { icon: '🔄', text: '重构这个函数', prompt: '请重构以下代码，提高可读性和可维护性：' },
  { icon: '🧪', text: '编写单元测试', prompt: '请为以下代码编写全面的单元测试：' },
  { icon: '📖', text: '解释这段代码', prompt: '请详细解释以下代码的工作原理：' },
]

const SHORTCUTS = [
  { keys: 'Ctrl+B', desc: '切换侧边栏' },
  { keys: 'Ctrl+`', desc: '终端' },
  { keys: 'Ctrl+K', desc: '命令面板' },
  { keys: 'Ctrl+,', desc: '设置' },
  { keys: 'Ctrl+Tab', desc: '切换会话' },
]

export function WelcomeScreen() {
  const { t } = useI18n()
  const addSession = useSessionStore((s) => s.addSession)
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  async function handleQuickStart(prompt: string) {
    const session = await window.api.createSession(t('sidebar.newSession'))
    addSession(session)
    setActiveSession(session.id)
    // The prompt will be auto-filled via a future improvement
  }

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 max-w-2xl mx-auto animate-fadeIn">
      {/* Logo */}
      <div className="text-5xl mb-4">🤖</div>
      <h2 className="text-xl font-bold text-text-primary mb-1">Claude Code</h2>
      <p className="text-sm text-text-muted mb-8">多 Agent AI 编程助手</p>

      {/* Quick start cards */}
      <div className="grid grid-cols-2 gap-2 w-full mb-10">
        {QUICK_STARTS.map((item) => (
          <button
            key={item.text}
            onClick={() => handleQuickStart(item.prompt)}
            className="flex items-center gap-3 px-4 py-3 bg-surface border border-hover rounded-xl text-left hover:border-primary/40 hover:bg-hover transition-all duration-150 group"
          >
            <span className="text-lg group-hover:scale-110 transition-transform">{item.icon}</span>
            <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">{item.text}</span>
          </button>
        ))}
      </div>

      {/* Shortcuts reference */}
      <div className="w-full">
        <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2 text-center">快捷键</p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {SHORTCUTS.map((s) => (
            <span key={s.keys} className="text-[10px] text-text-muted">
              <kbd className="px-1 py-0.5 bg-surface border border-hover rounded text-[9px] font-mono">{s.keys}</kbd>
              {' '}{s.desc}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/WelcomeScreen.tsx
git commit -m "feat: add WelcomeScreen with quick start cards and shortcuts"
```

---

### Task 15: SessionSidebar — Empty State Polish

**Files:**
- Modify: `src/components/panels/SessionSidebar.tsx`

- [ ] **Step 1: Update empty state rendering**

Replace the current empty state section (around lines 118-128):

```tsx
{sessions.length === 0 && (
  <div className="flex flex-col items-center justify-center text-center px-4 mt-12 animate-fadeIn">
    <p className="text-3xl mb-3">💬</p>
    <p className="text-xs text-text-secondary mb-1">还没有会话</p>
    <p className="text-[10px] text-text-muted mb-4">点击右上角 + 开始对话</p>
    <button
      onClick={handleNewSession}
      className="px-4 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
    >
      创建第一个会话
    </button>
  </div>
)}
{sessions.length > 0 && filteredSessions.length === 0 && (
  <div className="flex flex-col items-center justify-center text-center px-4 mt-12 animate-fadeIn">
    <p className="text-2xl mb-2">🔍</p>
    <p className="text-xs text-text-secondary">{t('sidebar.noMatch')}</p>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/panels/SessionSidebar.tsx
git commit -m "feat: polish SessionSidebar empty states"
```

---

### Task 16: Create SlashCommandMenu Component

**Files:**
- Create: `src/components/chat/SlashCommandMenu.tsx`

- [ ] **Step 1: Write SlashCommandMenu**

```typescript
// src/components/chat/SlashCommandMenu.tsx
import { useEffect, useRef, useCallback } from 'react'

interface Command {
  command: string
  label: string
  description: string
  promptPrefix: string
}

const COMMANDS: Command[] = [
  { command: '/explain', label: '解释代码', description: '解释选中代码的工作原理', promptPrefix: '请解释以下代码：\n' },
  { command: '/fix', label: '修复 Bug', description: '分析和修复代码中的 bug', promptPrefix: '请分析并修复以下代码中的 bug：\n' },
  { command: '/refactor', label: '重构代码', description: '提高代码可读性和可维护性', promptPrefix: '请重构以下代码，提高可读性和可维护性：\n' },
  { command: '/test', label: '生成测试', description: '为代码编写单元测试', promptPrefix: '请为以下代码编写全面的单元测试：\n' },
  { command: '/doc', label: '生成文档', description: '生成 JSDoc 或 API 文档', promptPrefix: '请为以下代码生成完整的文档：\n' },
  { command: '/review', label: '代码审查', description: '审查代码质量、安全性和性能', promptPrefix: '请审查以下代码的质量、安全性和性能：\n' },
  { command: '/optimize', label: '性能优化', description: '分析和优化代码性能', promptPrefix: '请分析以下代码的性能瓶颈并进行优化：\n' },
]

interface Props {
  isOpen: boolean
  query: string
  onSelect: (command: Command) => void
  onClose: () => void
  position: { top: number; left: number }
}

export function SlashCommandMenu({ isOpen, query, onSelect, onClose, position }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<number>(0)

  const filtered = COMMANDS.filter(
    (c) => c.command.includes(query.toLowerCase()) || c.label.includes(query)
  )

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        selectedRef.current = Math.min(selectedRef.current + 1, filtered.length - 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        selectedRef.current = Math.max(selectedRef.current - 1, 0)
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[selectedRef.current]) {
          onSelect(filtered[selectedRef.current])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [isOpen, filtered, onSelect, onClose])

  useEffect(() => {
    selectedRef.current = 0
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen || filtered.length === 0) return null

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-elevated border border-hover rounded-lg shadow-lg overflow-hidden animate-fadeIn"
      style={{ bottom: '100%', left: position.left, marginBottom: '4px', minWidth: '280px' }}
    >
      <div className="px-3 py-1.5 border-b border-hover">
        <span className="text-[10px] text-text-muted">命令</span>
      </div>
      {filtered.map((cmd, i) => (
        <button
          key={cmd.command}
          onClick={() => onSelect(cmd)}
          className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
            i === selectedRef.current ? 'bg-active' : 'hover:bg-hover'
          }`}
        >
          <span className="text-xs font-mono text-primary whitespace-nowrap">{cmd.command}</span>
          <span className="text-xs text-text-secondary">{cmd.label}</span>
          <span className="text-[10px] text-text-muted ml-auto">{cmd.description}</span>
        </button>
      ))}
    </div>
  )
}

export { COMMANDS }
export type { Command }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/SlashCommandMenu.tsx
git commit -m "feat: add SlashCommandMenu with 7 slash commands"
```

---

### Task 17: Create FileMentionDropdown Component + IPC

**Files:**
- Create: `src/components/chat/FileMentionDropdown.tsx`
- Modify: `src/main/ipc.ts` — add listProjectFiles handler
- Modify: `src/preload/index.ts` — expose listProjectFiles

- [ ] **Step 1: Add IPC handler in ipc.ts**

Add after the `fs:listDir` handler:
```typescript
// === File search for @mentions ===
ipcMain.handle('fs:searchFiles', async (_e, query: string) => {
  try {
    const rootPath = process.cwd()
    const { readdir, stat } = await import('fs/promises')
    const { join, relative, dirname } = await import('path')

    async function walk(dir: string, results: string[], depth: number): Promise<void> {
      if (depth > 4 || results.length >= 20) return  // Max depth and results
      try {
        const entries = await readdir(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.env.example') continue
          if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'out') continue
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
```

- [ ] **Step 2: Expose in preload**

Add to `src/preload/index.ts`:
```typescript
searchFiles: (query: string) => ipcRenderer.invoke('fs:searchFiles', query),
```

- [ ] **Step 3: Write FileMentionDropdown component**

```typescript
// src/components/chat/FileMentionDropdown.tsx
import { useEffect, useState, useRef, useCallback } from 'react'

const FILE_ICONS: Record<string, string> = {
  '.ts': '🔷', '.tsx': '⚛️', '.js': '🟨', '.jsx': '⚛️',
  '.json': '📋', '.css': '🎨', '.scss': '🎨', '.html': '🌐',
  '.md': '📝', '.py': '🐍', '.go': '🔵', '.rs': '🦀',
  '.yml': '⚙️', '.yaml': '⚙️', '.toml': '⚙️',
  '.test.ts': '🧪', '.spec.ts': '🧪', '.test.tsx': '🧪',
}

function getFileIcon(filename: string): string {
  if (filename.endsWith('/')) return '📁'
  for (const [ext, icon] of Object.entries(FILE_ICONS)) {
    if (filename.endsWith(ext)) return icon
  }
  return '📄'
}

interface Props {
  isOpen: boolean
  query: string
  onSelect: (filePath: string) => void
  onClose: () => void
}

export function FileMentionDropdown({ isOpen, query, onSelect, onClose }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const selectedRef = useRef(0)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || !query) {
      setFiles([])
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const results = await window.api.searchFiles(query)
        setFiles(results)
      } catch { setFiles([]) }
      setLoading(false)
    }, 150) // debounce
    return () => clearTimeout(timer)
  }, [isOpen, query])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        selectedRef.current = Math.min(selectedRef.current + 1, files.length - 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        selectedRef.current = Math.max(selectedRef.current - 1, 0)
        break
      case 'Enter':
        e.preventDefault()
        if (files[selectedRef.current]) {
          onSelect(files[selectedRef.current])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [isOpen, files, onSelect, onClose])

  useEffect(() => {
    selectedRef.current = 0
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen) return null

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-elevated border border-hover rounded-lg shadow-lg overflow-hidden animate-fadeIn"
      style={{ bottom: '100%', left: 0, marginBottom: '4px', minWidth: '320px', maxHeight: '240px', overflowY: 'auto' }}
    >
      <div className="px-3 py-1.5 border-b border-hover">
        <span className="text-[10px] text-text-muted">引用文件</span>
      </div>
      {loading && (
        <div className="px-3 py-2 text-xs text-text-muted">搜索中...</div>
      )}
      {!loading && files.length === 0 && (
        <div className="px-3 py-2 text-xs text-text-muted">未找到匹配的文件</div>
      )}
      {files.map((file, i) => (
        <button
          key={file}
          onClick={() => onSelect(file)}
          className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors ${
            i === selectedRef.current ? 'bg-active' : 'hover:bg-hover'
          }`}
        >
          <span className="text-sm">{getFileIcon(file)}</span>
          <span className="text-text-primary font-mono">{file}</span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/FileMentionDropdown.tsx src/main/ipc.ts src/preload/index.ts
git commit -m "feat: add FileMentionDropdown with IPC file search for @mentions"
```

---

### Task 18: Create PromptTemplatePicker Component

**Files:**
- Create: `src/components/chat/PromptTemplatePicker.tsx`

- [ ] **Step 1: Write PromptTemplatePicker**

```typescript
// src/components/chat/PromptTemplatePicker.tsx
import { useEffect, useRef, useCallback } from 'react'
import type { PromptTemplate } from '../../types'

const DEFAULT_TEMPLATES: PromptTemplate[] = [
  { id: 'explain', title: '解释代码', prompt: '请用中文详细解释以下代码的工作原理：\n', icon: '💡' },
  { id: 'test', title: '编写测试', prompt: '请为以下代码编写全面的单元测试用例：\n', icon: '🧪' },
  { id: 'doc', title: '生成文档', prompt: '请为以下函数/类生成完整的 JSDoc 文档：\n', icon: '📖' },
  { id: 'security', title: '安全审查', prompt: '请审查以下代码的安全漏洞和潜在风险：\n', icon: '🔒' },
  { id: 'perf', title: '性能分析', prompt: '请分析以下代码的性能瓶颈并给出优化建议：\n', icon: '⚡' },
  { id: 'review', title: '代码审查', prompt: '请对以下代码进行全面审查（可读性、健壮性、最佳实践）：\n', icon: '👁️' },
  { id: 'translate', title: '翻译注释', prompt: '请将以下代码中的注释翻译为中文：\n', icon: '🌐' },
  { id: 'simplify', title: '简化代码', prompt: '请简化以下代码，在不改变功能的前提下减少复杂度：\n', icon: '✨' },
]

interface Props {
  isOpen: boolean
  onSelect: (template: PromptTemplate) => void
  onClose: () => void
}

export function PromptTemplatePicker({ isOpen, onSelect, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef(0)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        selectedRef.current = Math.min(selectedRef.current + 1, DEFAULT_TEMPLATES.length - 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        selectedRef.current = Math.max(selectedRef.current - 1, 0)
        break
      case 'Enter':
        e.preventDefault()
        if (DEFAULT_TEMPLATES[selectedRef.current]) {
          onSelect(DEFAULT_TEMPLATES[selectedRef.current])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [isOpen, onSelect, onClose])

  useEffect(() => {
    selectedRef.current = 0
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen) return null

  return (
    <div
      ref={menuRef}
      className="absolute z-50 bg-elevated border border-hover rounded-lg shadow-lg overflow-hidden animate-fadeIn"
      style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '4px', minWidth: '320px' }}
    >
      <div className="px-3 py-1.5 border-b border-hover flex items-center justify-between">
        <span className="text-[10px] text-text-muted">提示词模板</span>
        <span className="text-[9px] text-text-muted">Ctrl+Shift+P</span>
      </div>
      <div className="grid grid-cols-2 gap-1 p-1.5">
        {DEFAULT_TEMPLATES.map((tpl, i) => (
          <button
            key={tpl.id}
            onClick={() => onSelect(tpl)}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-colors ${
              i === selectedRef.current ? 'bg-active ring-1 ring-primary/30' : 'hover:bg-hover'
            }`}
          >
            <span className="text-sm">{tpl.icon}</span>
            <span className="text-xs text-text-secondary">{tpl.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export { DEFAULT_TEMPLATES }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/PromptTemplatePicker.tsx
git commit -m "feat: add PromptTemplatePicker with 8 built-in templates"
```

---

### Task 19: Integrate @Mentions, /Commands, Templates into InputArea

**Files:**
- Modify: `src/components/chat/InputArea.tsx`

- [ ] **Step 1: Add state and import new components**

Add these imports and state variables at the top of InputArea:
```typescript
import { FileMentionDropdown } from './FileMentionDropdown'
import { SlashCommandMenu, COMMANDS } from './SlashCommandMenu'
import { PromptTemplatePicker, DEFAULT_TEMPLATES } from './PromptTemplatePicker'

// Add state inside the component:
const [showMentions, setShowMentions] = useState(false)
const [mentionQuery, setMentionQuery] = useState('')
const [showCommands, setShowCommands] = useState(false)
const [commandQuery, setCommandQuery] = useState('')
const [showTemplates, setShowTemplates] = useState(false)
const textareaRef = useRef<HTMLTextAreaElement>(null) // add this ref

// Handler for @mentions selection
const handleFileSelect = useCallback(async (filePath: string) => {
  // Replace @query with file name chip
  const beforeAt = input.slice(0, input.lastIndexOf('@'))
  setInput(beforeAt)
  setShowMentions(false)
  // Read file content via existing fs:readFile IPC
  try {
    const result = await window.api.readFile(filePath)
    if (result?.content && !result.error) {
      setFiles(prev => [...prev, { name: filePath.split('/').pop() || filePath, path: filePath, content: result.content }])
    }
  } catch { /* best-effort */ }
}, [input])

// Handler for /command selection
const handleCommandSelect = useCallback((cmd: { command: string; promptPrefix: string }) => {
  const beforeSlash = input.slice(0, input.lastIndexOf('/'))
  setInput(beforeSlash + cmd.promptPrefix)
  setShowCommands(false)
  textareaRef.current?.focus()
}, [input])

// Handler for template selection
const handleTemplateSelect = useCallback((tpl: { prompt: string }) => {
  setInput(input + '\n' + tpl.prompt)
  setShowTemplates(false)
  textareaRef.current?.focus()
}, [input])
```

- [ ] **Step 2: Add input detection logic**

Add an `useEffect` to detect @ and / triggers:
```typescript
useEffect(() => {
  // Detect @mention trigger
  const atMatch = input.match(/@(\S*)$/)
  if (atMatch) {
    setMentionQuery(atMatch[1])
    setShowMentions(true)
    setShowCommands(false)
    return
  }
  setShowMentions(false)

  // Detect /command trigger (at start of input or after whitespace)
  const slashMatch = input.match(/(?:^|\s)\/(\S*)$/)
  if (slashMatch) {
    setCommandQuery(slashMatch[1])
    setShowCommands(true)
    return
  }
  setShowCommands(false)
}, [input])
```

- [ ] **Step 3: Add keyboard shortcut for templates (Ctrl+Shift+P)**

Add to the keydown handler:
```typescript
// In handleKeyDown function:
if (e.key === 'p' && e.ctrlKey && e.shiftKey) {
  e.preventDefault()
  setShowTemplates(!showTemplates)
  return
}
// Close menus on Escape
if (e.key === 'Escape') {
  setShowMentions(false)
  setShowCommands(false)
  setShowTemplates(false)
}
```

- [ ] **Step 4: Add dropdown components to JSX**

Add inside the input area div, before the textarea:
```tsx
{/* @ File mention dropdown */}
<div className="relative">
  <FileMentionDropdown
    isOpen={showMentions}
    query={mentionQuery}
    onSelect={handleFileSelect}
    onClose={() => setShowMentions(false)}
  />
</div>

{/* / Slash command menu */}
<div className="relative">
  <SlashCommandMenu
    isOpen={showCommands}
    query={commandQuery}
    onSelect={handleCommandSelect}
    onClose={() => setShowCommands(false)}
    position={{ top: 0, left: 0 }}
  />
</div>

{/* Prompt template picker */}
<div className="relative">
  <PromptTemplatePicker
    isOpen={showTemplates}
    onSelect={handleTemplateSelect}
    onClose={() => setShowTemplates(false)}
  />
</div>
```

Also add `ref={textareaRef}` to the textarea element.

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/InputArea.tsx
git commit -m "feat: integrate @mentions, /commands, prompt templates into InputArea"
```

---

### Task 20: Add Global CSS Animations

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Add animation keyframes**

Add in the `<style>` tag of `src/renderer/index.html`:
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

.animate-fadeIn {
  animation: fadeIn 150ms ease-out;
}

.animate-scaleIn {
  animation: scaleIn 200ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/index.html
git commit -m "feat: add global CSS animations with reduced-motion support"
```

---

### Task 21: Final Integration & Smoke Test

**Files:**
- All modified files

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any remaining type errors. Expected: clean compilation.

- [ ] **Step 2: Run existing tests**

```bash
npm test
```

Expected: all existing tests pass (or same pass/fail as before).

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit final integration fixes**

```bash
git add -A
git commit -m "chore: final TypeScript fixes and build verification for Phase 1"
```

---
