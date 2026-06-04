export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  toolCalls?: ToolCall[]
  feedback?: 'up' | 'down'
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
