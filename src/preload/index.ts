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
    ipcRenderer.invoke('app:projectRoot')
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
