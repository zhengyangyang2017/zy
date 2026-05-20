export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  toolCalls?: ToolCall[]
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
}

export interface StreamState {
  isStreaming: boolean
  abortController: AbortController | null
}

export type PanelTab = 'files' | 'tasks' | 'git'

export type Theme = 'dark' | 'light'

export interface PanelLayout {
  sidebarOpen: boolean
  sidebarWidth: number
  rightPanelOpen: boolean
  rightPanelWidth: number
  rightPanelTab: PanelTab
  bottomPanelOpen: boolean
  bottomPanelHeight: number
}
