import { app, BrowserWindow, shell } from 'electron'
import { join, resolve } from 'path'
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
import { destroyAllSessions } from './services/terminal'
import { initLicense, shutdownLicense, getLicenseStatus } from './services/license'
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

// Register custom protocol for license activation
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('codebuddy', process.execPath, [resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('codebuddy')
}

// Handle custom protocol on macOS
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleActivationUrl(url)
})

// Single instance lock + Windows/Linux protocol handling
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find(arg => arg.startsWith('codebuddy://'))
    if (url) handleActivationUrl(url)
    // Focus existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function handleActivationUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.pathname === 'activate' || parsed.hostname === 'activate') {
      const token = parsed.searchParams.get('token')
      if (token) {
        import('./services/license').then(({ activateLicense }) => {
          activateLicense(token).then(status => {
            logger.info('Main', `Activated via protocol: tier=${status.tier}`)
            if (mainWindow) {
              mainWindow.webContents.send('license:activated', status)
            }
          }).catch(err => {
            logger.error('Main', 'Protocol activation failed:', err)
          })
        })
      }
    }
  } catch (err) {
    logger.error('Main', 'Invalid activation URL:', err)
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

  // Initialize license (trial or stored tokens)
  initLicense().then(status => {
    logger.info('Main', `License: tier=${status.tier} trial=${status.trial}`)
  }).catch(err => {
    logger.error('Main', 'License init failed:', err)
  })

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
      const { tier } = getLicenseStatus()
      const agentCount = tier === 'pro' || tier === 'enterprise' ? 20 : 3
      startCluster!({ agentCount }).then(() => {
        logger.info('Main', `Agent cluster started with ${agentCount} agents (tier=${tier})`)
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
  shutdownLicense()
  stopScheduler()
  destroyAllSessions()
  if (stopCluster) stopCluster().catch(() => {})
  if (process.platform !== 'darwin') app.quit()
})
