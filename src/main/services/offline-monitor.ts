/**
 * Offline connectivity monitor.
 *
 * Detects network changes, publishes events, and tracks offline state.
 * UI components can subscribe to show offline indicators.
 */

import { BrowserWindow } from 'electron'
import https from 'https'
import { logger } from './logger'

let isOnline = true
let checkTimer: ReturnType<typeof setInterval> | null = null
let listeners: Array<(online: boolean) => void> = []

export function initOfflineMonitor(): void {
  // Check immediately
  checkConnectivity()

  // Periodic check every 30s
  checkTimer = setInterval(checkConnectivity, 30000)

  logger.info('OfflineMonitor', 'Initialized')
}

export function stopOfflineMonitor(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
}

function checkConnectivity(): void {
  const req = https.get(
    'https://www.google.com',
    { timeout: 5000 },
    () => {
      if (!isOnline) {
        isOnline = true
        broadcast(true)
        logger.info('OfflineMonitor', 'Network restored')
      }
    }
  )

  req.on('error', () => {
    if (isOnline) {
      isOnline = false
      broadcast(false)
      logger.warn('OfflineMonitor', 'Network lost')
    }
  })

  req.on('timeout', () => {
    req.destroy()
    if (isOnline) {
      isOnline = false
      broadcast(false)
    }
  })
}

function broadcast(online: boolean): void {
  listeners.forEach(fn => {
    try { fn(online) } catch { /* ignore */ }
  })

  // Also notify all renderer windows
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('offline:status', { online })
    } catch { /* window may be closed */ }
  }
}

/** Subscribe to connectivity changes. Returns unsubscribe function. */
export function onConnectivityChange(fn: (online: boolean) => void): () => void {
  listeners.push(fn)
  return () => {
    listeners = listeners.filter(l => l !== fn)
  }
}

/** Get current connectivity status. */
export function getConnectivityStatus(): boolean {
  return isOnline
}
