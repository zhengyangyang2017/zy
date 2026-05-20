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
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronApi = typeof api
