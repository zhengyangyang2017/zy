/**
 * IPC response types — one source of truth for all channel contracts.
 *
 * Every IPC handler returns one of these types.
 * The preload bridge uses these to type the renderer API.
 */

import type { TaskType, AgentRole, TaskInput } from '../main/services/cluster/types'

// ============================================
// Config
// ============================================

export interface AppConfig {
  apiKey: string
  baseUrl: string
  model: string
  theme: 'dark' | 'light'
  fontSize: number
  language: 'zh-CN' | 'en'
}

// ============================================
// Cluster
// ============================================

export interface ClusterTaskSubmitParams {
  type: TaskType
  role: AgentRole
  input: TaskInput
  priority?: number
}

export interface ClusterEventPayload {
  type: 'task-update' | 'agent-update' | 'workflow-update'
}

export interface ClusterResultPayload {
  taskType?: string
  taskId: string
  output?: string
  error?: string
  success: boolean
}

export interface ClusterStateResponse {
  config: Record<string, unknown>
  agents: Array<Record<string, unknown>>
  queueStats: Record<string, unknown>
  uptime: number
  avgThroughput: number
}

// ============================================
// Search
// ============================================

export interface SearchResult {
  id: string
  sessionId: string
  sessionTitle: string
  role: string
  content: string
  createdAt: string
}

// ============================================
// Export
// ============================================

export interface ExportResult {
  success: boolean
  path?: string
  error?: string
}

// ============================================
// Chat
// ============================================

export interface SendMessageParams {
  sessionId: string
  messages: Array<{ role: string; content: string }>
}

export interface StreamChunkData {
  sessionId: string
  chunk: string
}

export interface StreamDoneData {
  sessionId: string
  message: unknown
}

export interface StreamErrorData {
  sessionId: string
  error: string
}
