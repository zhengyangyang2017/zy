/**
 * License service — manages JWT tokens, trial state, and license verification
 * for the Electron main process.
 *
 * Token storage: reuses secure-store.ts for OS-level encryption
 * Trial storage: local SQLite (trial_start_date, device_id)
 * Offline grace: 7 days from last successful online verification
 */

import { encryptSecret, decryptSecret } from './secure-store'
import { getDb } from '../db'
import { logger } from './logger'

const LICENSE_SERVER_URL = 'https://your-app.vercel.app' // CHANGEME: set to actual Vercel URL
const TRIAL_DAYS = 7
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000 // refresh every 24h
const VERIFY_TIMEOUT_MS = 10000 // 10s timeout for API calls

export interface LicenseStatus {
  tier: 'free' | 'pro' | 'enterprise'
  trial: boolean
  daysRemaining?: number
  userId?: string
}

interface StoredTokens {
  accessToken: string
  refreshToken: string
  lastOnlineCheck: number // Date.now() timestamp
  userId: string
}

let cachedStatus: LicenseStatus | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null

// ============================================
// Public API
// ============================================

/** Initialize license on app startup. Returns current status. */
export async function initLicense(): Promise<LicenseStatus> {
  // Initialize trial table
  initTrialTable()
  initKvStore()

  // Try to load stored tokens
  const tokens = loadTokens()
  if (tokens) {
    // Verify with server (or use cache if within grace period)
    const status = await verifyOrGrace(tokens)
    cachedStatus = status
    startRefreshTimer()
    return status
  }

  // No tokens: check trial
  const trialStatus = getOrStartTrial()
  cachedStatus = trialStatus
  return trialStatus
}

/** Get current license status (cached). */
export function getLicenseStatus(): LicenseStatus {
  return cachedStatus || { tier: 'free', trial: false }
}

/** Activate license with activation token (from custom protocol). */
export async function activateLicense(activationToken: string): Promise<LicenseStatus> {
  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activation_token: activationToken }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }

    const data = await res.json()
    saveTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      lastOnlineCheck: Date.now(),
      userId: '', // Will be populated from JWT claims on next verify
    })

    const status: LicenseStatus = {
      tier: data.tier || 'pro',
      trial: data.trial || false,
    }
    cachedStatus = status
    startRefreshTimer()
    logger.info('License', `Activated: tier=${status.tier}`)
    return status
  } catch (err) {
    logger.error('License', 'Activation failed:', err)
    throw err
  }
}

/** Login with phone + SMS code. Returns license status. */
export async function loginWithPhone(phone: string, code: string): Promise<LicenseStatus> {
  try {
    const res = await fetch(`${LICENSE_SERVER_URL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(err.error || `HTTP ${res.status}`)
    }

    const data = await res.json()
    saveTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      lastOnlineCheck: Date.now(),
      userId: '', // Will be populated from JWT claims
    })

    const status: LicenseStatus = {
      tier: data.tier || 'free',
      trial: data.trial || false,
    }
    cachedStatus = status
    startRefreshTimer()
    return status
  } catch (err) {
    logger.error('License', 'Login failed:', err)
    throw err
  }
}

/** Logout: clear tokens, revert to trial or free. */
export function logout(): void {
  clearTokens()
  stopRefreshTimer()
  const trialStatus = getOrStartTrial()
  cachedStatus = trialStatus
  logger.info('License', 'Logged out')
}

/** Clean up on app shutdown. */
export function shutdownLicense(): void {
  stopRefreshTimer()
}

// ============================================
// Token management
// ============================================

function loadTokens(): StoredTokens | null {
  try {
    const db = getDb()
    const row = db.prepare(`
      SELECT value FROM kv_store WHERE key = 'license_tokens'
    `).get() as { value: string } | undefined
    if (!row) return null
    return JSON.parse(decryptSecret(row.value)) as StoredTokens
  } catch {
    return null
  }
}

function saveTokens(tokens: StoredTokens): void {
  const db = getDb()
  const encrypted = encryptSecret(JSON.stringify(tokens))
  db.prepare(`
    INSERT OR REPLACE INTO kv_store (key, value, updated_at)
    VALUES ('license_tokens', ?, datetime('now'))
  `).run(encrypted)
}

function clearTokens(): void {
  const db = getDb()
  db.prepare("DELETE FROM kv_store WHERE key = 'license_tokens'").run()
}

async function verifyOrGrace(tokens: StoredTokens): Promise<LicenseStatus> {
  const now = Date.now()
  const offlineDuration = now - tokens.lastOnlineCheck

  // If within grace period, check if we can use local token data
  if (offlineDuration < OFFLINE_GRACE_MS) {
    try {
      // Try to decode JWT payload without verifying (for tier info)
      const payload = JSON.parse(
        Buffer.from(tokens.accessToken.split('.')[1], 'base64').toString('utf-8')
      ) as { sub: string; tier: string; trial: boolean; exp: number }

      // If access token is still valid, return cached tier
      if (payload.exp * 1000 > now) {
        return {
          tier: payload.tier as LicenseStatus['tier'],
          trial: payload.trial,
          userId: payload.sub,
        }
      }

      // Try to refresh
      const refreshed = await refreshTokens(tokens)
      return refreshed
    } catch {
      // Decode failed — fall through to online check
    }
  }

  // Offline grace expired or decode failed: require online check
  try {
    return await onlineVerify(tokens)
  } catch {
    // Server unreachable and grace expired: fall back to trial or free
    logger.warn('License', 'Server unreachable, grace expired — falling back to trial')
    const trialStatus = getOrStartTrial()
    return trialStatus
  }
}

async function onlineVerify(tokens: StoredTokens): Promise<LicenseStatus> {
  const res = await fetch(`${LICENSE_SERVER_URL}/api/license/verify`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  })

  if (!res.ok) {
    // Token expired or invalid, try refresh
    return await refreshTokens(tokens)
  }

  const data = await res.json()
  tokens.accessToken = data.access_token || tokens.accessToken
  tokens.lastOnlineCheck = Date.now()
  saveTokens(tokens)

  return {
    tier: data.tier || 'free',
    trial: data.trial || false,
    userId: tokens.userId,
  }
}

async function refreshTokens(tokens: StoredTokens): Promise<LicenseStatus> {
  const res = await fetch(`${LICENSE_SERVER_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
  })

  if (!res.ok) {
    throw new Error('Token refresh failed')
  }

  const data = await res.json()
  tokens.accessToken = data.access_token
  tokens.lastOnlineCheck = Date.now()
  saveTokens(tokens)

  return {
    tier: data.tier || 'free',
    trial: data.trial || false,
    userId: tokens.userId,
  }
}

// ============================================
// Trial management
// ============================================

function initKvStore(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
}

function initTrialTable(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS trial_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 1
    )
  `)
}

function getOrStartTrial(): LicenseStatus {
  const db = getDb()
  const trial = db.prepare('SELECT start_date, end_date FROM trial_state WHERE id = 1').get() as {
    start_date: string; end_date: string
  } | undefined

  if (trial) {
    const endDate = new Date(trial.end_date)
    const now = new Date()
    if (endDate > now) {
      const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      return { tier: 'pro', trial: true, daysRemaining }
    }
    // Trial expired
    return { tier: 'free', trial: false }
  }

  // Start new trial
  const now = new Date()
  const endDate = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
  db.prepare('INSERT INTO trial_state (id, start_date, end_date) VALUES (1, ?, ?)')
    .run(now.toISOString(), endDate.toISOString())

  logger.info('License', `Trial started, ends ${endDate.toISOString()}`)
  return { tier: 'pro', trial: true, daysRemaining: TRIAL_DAYS }
}

// ============================================
// Timer
// ============================================

function startRefreshTimer(): void {
  stopRefreshTimer()
  refreshTimer = setInterval(async () => {
    const tokens = loadTokens()
    if (!tokens) {
      stopRefreshTimer()
      return
    }
    try {
      const result = await refreshTokens(tokens)
      cachedStatus = result
      logger.info('License', 'Tokens refreshed')
    } catch {
      logger.warn('License', 'Token refresh failed, will retry')
    }
  }, REFRESH_INTERVAL_MS)
}

function stopRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}
