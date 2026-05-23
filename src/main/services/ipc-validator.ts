/**
 * IPC input validation — enterprise security layer for all IPC channels.
 *
 * Every IPC handler should validate its inputs before processing.
 * This module provides reusable validators.
 */

export type ValidationResult = { valid: true } | { valid: false; error: string }

export function validateString(value: unknown, field: string, maxLen: number = 100000): ValidationResult {
  if (typeof value !== 'string') {
    return { valid: false, error: `${field} 必须是字符串` }
  }
  if (value.length > maxLen) {
    return { valid: false, error: `${field} 超过最大长度 ${maxLen}` }
  }
  return { valid: true }
}

export function validateOptionalString(value: unknown, field: string, maxLen: number = 100000): ValidationResult {
  if (value === undefined || value === null) return { valid: true }
  return validateString(value, field, maxLen)
}

export function validateNumber(value: unknown, field: string, min: number = 0, max: number = 1): ValidationResult {
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: `${field} 必须是数字` }
  }
  if (value < min || value > max) {
    return { valid: false, error: `${field} 必须在 ${min}-${max} 范围内` }
  }
  return { valid: true }
}

export function validateRecord(value: unknown, field: string): ValidationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { valid: false, error: `${field} 必须是对象` }
  }
  return { valid: true }
}

/**
 * Sanitize user text for safe storage/display.
 * Removes control characters, normalizes whitespace.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars except \n \t
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
}

/** Validate a chat message array. */
export function validateMessages(messages: unknown): ValidationResult {
  if (!Array.isArray(messages)) {
    return { valid: false, error: 'messages 必须是数组' }
  }
  if (messages.length > 200) {
    return { valid: false, error: '消息数量超过上限' }
  }
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as Record<string, unknown>
    if (typeof msg?.role !== 'string' || !['user', 'assistant', 'system'].includes(msg.role)) {
      return { valid: false, error: `消息[${i}] role 无效` }
    }
    if (typeof msg?.content !== 'string') {
      return { valid: false, error: `消息[${i}] content 必须是字符串` }
    }
  }
  return { valid: true }
}
