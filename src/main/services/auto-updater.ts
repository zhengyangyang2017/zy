/**
 * Auto-update module — checks for updates via GitHub Releases.
 *
 * Uses electron-updater (requires electron-builder publish config).
 * Falls back gracefully if no update server is reachable.
 */

import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog } from 'electron'
import { logger } from './logger'

let updateCheckTimer: ReturnType<typeof setInterval> | null = null
let updateAvailable = false
let updateDownloaded = false

export interface UpdateStatus {
  checking: boolean
  available: boolean
  downloaded: boolean
  version: string | null
  error: string | null
}

let currentStatus: UpdateStatus = {
  checking: false,
  available: false,
  downloaded: false,
  version: null,
  error: null,
}

export function getUpdateStatus(): UpdateStatus {
  return { ...currentStatus }
}

export function initAutoUpdater(): void {
  try {
    // Configure auto-updater
    autoUpdater.autoDownload = true
    autoUpdater.allowDowngrade = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      currentStatus = { ...currentStatus, checking: true, error: null }
    })

    autoUpdater.on('update-available', (info) => {
      currentStatus = {
        checking: false,
        available: true,
        downloaded: false,
        version: info.version,
        error: null,
      }
      updateAvailable = true
      logger.info('AutoUpdater', `Update available: ${info.version}`)
    })

    autoUpdater.on('update-not-available', () => {
      currentStatus = {
        checking: false,
        available: false,
        downloaded: false,
        version: null,
        error: null,
      }
    })

    autoUpdater.on('update-downloaded', (info) => {
      currentStatus = {
        checking: false,
        available: true,
        downloaded: true,
        version: info.version,
        error: null,
      }
      updateDownloaded = true
      logger.info('AutoUpdater', `Update downloaded: ${info.version}`)

      // Notify user
      const wins = BrowserWindow.getAllWindows()
      for (const win of wins) {
        win.webContents.send('update:available', {
          version: info.version,
          downloaded: true,
        })
      }
    })

    autoUpdater.on('error', (err) => {
      currentStatus = {
        ...currentStatus,
        checking: false,
        error: err.message,
      }
      logger.error('AutoUpdater', `Error: ${err.message}`)
    })

    logger.info('AutoUpdater', 'Initialized')
  } catch (err) {
    logger.warn('AutoUpdater', `Failed to initialize: ${err}`)
  }
}

/** Check for updates now. Returns current status. */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (currentStatus.checking) return currentStatus

  try {
    currentStatus.checking = true
    await autoUpdater.checkForUpdates()
  } catch (err) {
    currentStatus = {
      checking: false,
      available: false,
      downloaded: false,
      version: null,
      error: err instanceof Error ? err.message : String(err),
    }
  }

  return currentStatus
}

/** Start periodic update checks. */
export function startPeriodicUpdateCheck(intervalMs: number = 4 * 60 * 60 * 1000): void {
  if (updateCheckTimer) return
  // Check on start (delayed)
  setTimeout(() => checkForUpdates(), 30000)
  // Periodic
  updateCheckTimer = setInterval(() => checkForUpdates(), intervalMs)
}

/** Stop periodic checks. */
export function stopPeriodicUpdateCheck(): void {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer)
    updateCheckTimer = null
  }
}

/** Install the downloaded update and restart. */
export function installUpdate(): void {
  if (updateDownloaded) {
    autoUpdater.quitAndInstall()
  }
}
