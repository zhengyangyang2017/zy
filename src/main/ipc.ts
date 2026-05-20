import { ipcMain } from 'electron'
import { registerChatIpc } from './services/anthropic'

export function registerIpcHandlers(): void {
  registerChatIpc()

  // Session stubs (will be wired to SQLite in Phase 3)
  ipcMain.handle('session:list', async () => [])
  ipcMain.handle('session:create', async (_e, title: string) => ({
    id: crypto.randomUUID(), title, createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(), messageCount: 0, status: 'active'
  }))
  ipcMain.handle('session:delete', async () => true)
  ipcMain.handle('session:messages', async () => [])
}
