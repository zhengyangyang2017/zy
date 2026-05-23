import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { startScheduler, stopScheduler } from './services/learning/scheduler'
import { seedFromProject } from './services/learning/cold-start'
import { logger } from './services/logger'

// Lazy-loaded cluster (avoids ~120KB main bundle blocking startup)
let startCluster: ((config?: any) => Promise<any>) | null = null
let stopCluster: (() => Promise<void>) | null = null

async function loadCluster() {
  if (startCluster) return
  const mod = await import('./services/cluster')
  startCluster = mod.startCluster
  stopCluster = mod.stopCluster
}
import { runMigrations } from './services/migrations'
import { initCrashReporter, shouldStartSafeMode } from './services/crash-reporter'
import { initAutoUpdater, startPeriodicUpdateCheck, stopPeriodicUpdateCheck } from './services/auto-updater'
import { initOfflineMonitor, stopOfflineMonitor } from './services/offline-monitor'
import { getDb } from './db'

let mainWindow: BrowserWindow | null = null
let safeMode = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: safeMode ? 'Claude Code (安全模式)' : 'Claude Code',
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
  // Initialize crash reporter first
  initCrashReporter()

  // Run database migrations
  try {
    const db = getDb()
    const version = runMigrations(db)
    logger.info('Main', `DB schema v${version}`)
  } catch (err) {
    logger.error('Main', 'DB migration failed:', err)
  }

  // Check safe mode
  safeMode = shouldStartSafeMode()
  if (safeMode) {
    logger.warn('Main', 'Starting in safe mode (frequent crashes detected)')
  }

  registerIpcHandlers()
  createWindow()

  // Initialize auto-updater
  initAutoUpdater()
  startPeriodicUpdateCheck()

  // Initialize offline monitor
  initOfflineMonitor()

  // Start background learning scheduler
  startScheduler()

  // Start agent cluster (lazy-loaded, skip in safe mode)
  if (!safeMode) {
    loadCluster().then(() => {
      startCluster!().then(() => {
        logger.info('Main', 'Agent cluster started')
      }).catch((err: Error) => {
        logger.error('Main', 'Agent cluster start failed:', err)
      })
    })
  }

  // Cold start: seed initial knowledge from project files
  seedFromProject().then(count => {
    if (count > 0) logger.info('Learning', `Cold start seeded ${count} nodes`)
  }).catch(err => {
    logger.error('Learning', 'Cold start failed:', err)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopPeriodicUpdateCheck()
  stopOfflineMonitor()
  stopScheduler()
  if (stopCluster) stopCluster().catch(() => {})
  if (process.platform !== 'darwin') app.quit()
})
