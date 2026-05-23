/**
 * Secure credential storage using OS-level encryption.
 *
 * - Windows: DPAPI (Data Protection API)
 * - macOS: Keychain
 * - Linux: libsecret (falls back to plaintext with warning)
 *
 * Uses Electron safeStorage API (available in Electron 21+).
 */

import { safeStorage } from 'electron'
import { logger } from './logger'

let secureAvailable = false

export function initSecureStore(): void {
  secureAvailable = safeStorage.isEncryptionAvailable()
  if (!secureAvailable) {
    logger.warn('SecureStore', 'OS encryption not available — secrets stored as plaintext')
  } else {
    logger.info('SecureStore', 'OS-level encryption available')
  }
}

/** Encrypt a string. Returns base64-encoded ciphertext. */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''

  if (secureAvailable) {
    try {
      const encrypted = safeStorage.encryptString(plaintext)
      return encrypted.toString('base64')
    } catch (err) {
      logger.error('SecureStore', 'Encryption failed, storing as plaintext:', err)
    }
  }

  // Fallback: store with simple obfuscation (NOT secure, but better than raw plaintext)
  return Buffer.from(plaintext).toString('base64')
}

/** Decrypt a string. Takes base64-encoded ciphertext. */
export function decryptSecret(encoded: string): string {
  if (!encoded) return ''

  if (secureAvailable) {
    try {
      const buffer = Buffer.from(encoded, 'base64')
      return safeStorage.decryptString(buffer)
    } catch {
      // May have been stored as fallback base64
    }
  }

  // Fallback: try to decode as simple base64
  try {
    return Buffer.from(encoded, 'base64').toString('utf-8')
  } catch {
    return encoded
  }
}

/** Check if secure encryption is available. */
export function isSecureAvailable(): boolean {
  return secureAvailable
}
