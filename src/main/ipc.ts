import { ipcMain } from 'electron'

export function registerIpcHandlers(): void {
  // Chat IPC will be registered in Task 5

  // Session stubs
  ipcMain.handle('session:list', async () => [])
  ipcMain.handle('session:create', async (_e, title: string) => ({
    id: crypto.randomUUID(), title, createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), messageCount: 0, status: 'active'
  }))
  ipcMain.handle('session:delete', async () => true)
  ipcMain.handle('session:messages', async () => [])
}
