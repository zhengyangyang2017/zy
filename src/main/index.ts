import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { startScheduler, stopScheduler } from './services/learning/scheduler'
import { seedFromProject } from './services/learning/cold-start'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'Claude Code',
    backgroundColor: '#0a0a14',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    const prefix = ['', '⚠', '❌'][level] || '📝'
    console.log(`[renderer] ${prefix} ${message}`)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  // Start background learning scheduler
  startScheduler()

  // Cold start: seed initial knowledge from project files
  seedFromProject().then(count => {
    if (count > 0) console.log(`[Learning] Cold start seeded ${count} nodes`)
  }).catch(err => {
    console.error('[Learning] Cold start failed:', err)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopScheduler()
  if (process.platform !== 'darwin') app.quit()
})
