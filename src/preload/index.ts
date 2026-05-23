import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Chat
  sendMessage: (params: { sessionId: string; messages: { role: string; content: string }[] }) =>
    ipcRenderer.invoke('chat:send', params),

  abortMessage: (sessionId: string) =>
    ipcRenderer.invoke('chat:abort', sessionId),

  // Session
  getSessions: () =>
    ipcRenderer.invoke('session:list'),

  createSession: (title: string) =>
    ipcRenderer.invoke('session:create', title),

  deleteSession: (id: string) =>
    ipcRenderer.invoke('session:delete', id),

  renameSession: (id: string, title: string) =>
    ipcRenderer.invoke('session:rename', id, title),

  getMessages: (sessionId: string) =>
    ipcRenderer.invoke('session:messages', sessionId),

  saveMessage: (sessionId: string, message: {
    id: string; sessionId: string; role: string; content: string; createdAt: string
  }) =>
    ipcRenderer.invoke('session:addMessage', sessionId, message),

  // Streaming listeners
  onStreamChunk: (callback: (data: { sessionId: string; chunk: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; chunk: string }) =>
      callback(data)
    ipcRenderer.on('chat:stream-chunk', handler)
    return () => ipcRenderer.removeListener('chat:stream-chunk', handler)
  },

  onStreamDone: (callback: (data: { sessionId: string; message: unknown }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; message: unknown }) =>
      callback(data)
    ipcRenderer.on('chat:stream-done', handler)
    return () => ipcRenderer.removeListener('chat:stream-done', handler)
  },

  onStreamError: (callback: (data: { sessionId: string; error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { sessionId: string; error: string }) =>
      callback(data)
    ipcRenderer.on('chat:stream-error', handler)
    return () => ipcRenderer.removeListener('chat:stream-error', handler)
  },

  // Clipboard
  copyToClipboard: (text: string) =>
    ipcRenderer.invoke('clipboard:copy', text),

  // File
  openFileDialog: () =>
    ipcRenderer.invoke('dialog:openFile'),

  // File system browser
  listDirectory: (dirPath: string) =>
    ipcRenderer.invoke('fs:listDir', dirPath),

  readFileContent: (filePath: string) =>
    ipcRenderer.invoke('fs:readFile', filePath),

  // Git
  gitStatus: () =>
    ipcRenderer.invoke('git:status'),

  gitLog: () =>
    ipcRenderer.invoke('git:log'),

  gitDiff: (file: string) =>
    ipcRenderer.invoke('git:diff', file),

  // Tasks
  listTasks: () =>
    ipcRenderer.invoke('tasks:list'),

  createTask: (topic: string, priority: number) =>
    ipcRenderer.invoke('tasks:create', topic, priority),

  startResearch: (topic: string) =>
    ipcRenderer.invoke('tasks:research', topic),

  // Knowledge
  getKnowledgeStats: () =>
    ipcRenderer.invoke('knowledge:stats'),

  // App
  getProjectRoot: () =>
    ipcRenderer.invoke('app:projectRoot'),

  // Terminal
  executeShellCommand: (cmd: string) =>
    ipcRenderer.invoke('terminal:exec', cmd),

  // Agent Cluster
  getClusterState: () =>
    ipcRenderer.invoke('cluster:state'),

  submitClusterGoal: (goal: string, context?: string) =>
    ipcRenderer.invoke('cluster:submitGoal', goal, context),

  onClusterEvent: (callback: (data: { type: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { type: string }) => callback(data)
    ipcRenderer.on('cluster:event', handler)
    return () => ipcRenderer.removeListener('cluster:event', handler)
  },

  onClusterResult: (callback: (data: { taskType?: string; taskId: string; output?: string; error?: string; success: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on('chat:cluster-result', handler)
    return () => ipcRenderer.removeListener('chat:cluster-result', handler)
  },

  // Search
  searchMessages: (query: string) =>
    ipcRenderer.invoke('messages:search', query),

  // Export
  exportSession: (sessionId: string, format: string) =>
    ipcRenderer.invoke('export:session', sessionId, format),

  exportKnowledge: () =>
    ipcRenderer.invoke('export:knowledge'),

  // Settings
  loadConfig: () =>
    ipcRenderer.invoke('config:load'),

  saveConfig: (updates: Record<string, unknown>) =>
    ipcRenderer.invoke('config:save', updates),
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
