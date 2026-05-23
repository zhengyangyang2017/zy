/**
 * App configuration — persistent settings stored in userData/config.json.
 * Falls back to .env vars if no config value is set.
 */

import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { encryptSecret, decryptSecret, initSecureStore } from './secure-store'
import { logger } from './logger'

// Ensure secure store is initialized when config loads
initSecureStore()

export interface AppConfig {
  apiKey: string
  baseUrl: string
  model: string
  theme: 'dark' | 'light'
  fontSize: number
}

interface PersistedConfig {
  apiKeyEncrypted?: string
  apiKey?: string       // Legacy plaintext (migrated on first save)
  baseUrl: string
  model: string
  theme: 'dark' | 'light'
  fontSize: number
}

const DEFAULT_CONFIG: AppConfig = {
  apiKey: '',
  baseUrl: '',
  model: '',
  theme: 'dark',
  fontSize: 14,
}

let config: AppConfig | null = null
let configPath: string | null = null

function getConfigPath(): string {
  if (!configPath) {
    configPath = join(app.getPath('userData'), 'config.json')
  }
  return configPath
}

export function loadConfig(): AppConfig {
  if (config !== null) return config

  try {
    const p = getConfigPath()
    if (existsSync(p)) {
      const raw: PersistedConfig = JSON.parse(readFileSync(p, 'utf-8'))
      // Decrypt API key if stored encrypted, otherwise use plaintext (legacy)
      const apiKey = raw.apiKeyEncrypted
        ? decryptSecret(raw.apiKeyEncrypted)
        : (raw.apiKey || '')

      config = {
        ...DEFAULT_CONFIG,
        ...raw,
        apiKey,
      }
    } else {
      config = { ...DEFAULT_CONFIG }
    }
  } catch (err) {
    logger.error('Config', 'Failed to load config:', err)
    config = { ...DEFAULT_CONFIG }
  }

  // Fall back to env vars for API settings if not in config
  if (!config.apiKey) {
    config.apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  }
  if (!config.baseUrl) {
    config.baseUrl = import.meta.env.VITE_API_BASE_URL || process.env.VITE_API_BASE_URL || ''
  }
  if (!config.model) {
    config.model = import.meta.env.VITE_MODEL_NAME || process.env.VITE_MODEL_NAME || ''
  }

  return config
}

export function saveConfig(updates: Partial<AppConfig>): AppConfig {
  const current = loadConfig()
  config = { ...current, ...updates }

  // Encrypt API key before persisting
  const toPersist: PersistedConfig = {
    baseUrl: config.baseUrl,
    model: config.model,
    theme: config.theme,
    fontSize: config.fontSize,
  }
  if (config.apiKey) {
    toPersist.apiKeyEncrypted = encryptSecret(config.apiKey)
  }

  const p = getConfigPath()
  try {
    const dir = dirname(p)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(p, JSON.stringify(toPersist, null, 2), 'utf-8')
  } catch (err) {
    logger.error('Config', 'Failed to save config:', err)
  }

  return config
}

export function getApiKey(): string {
  return loadConfig().apiKey
}

export function getBaseUrl(): string {
  return loadConfig().baseUrl
}

export function getModel(): string {
  return loadConfig().model
}
