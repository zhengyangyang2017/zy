/**
 * Structured logger — wraps console with level-based filtering.
 * Set LOG_LEVEL env var to control: debug | info | warn | error | silent
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LEVEL_PRIO: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 999,
}

function getLevel(): LogLevel {
  const env = (typeof process !== 'undefined' && process.env?.LOG_LEVEL) || ''
  if (LEVEL_PRIO[env as LogLevel] !== undefined) return env as LogLevel
  // In dev mode (electron-vite dev), show debug. In production, show info+.
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') return 'info'
  return 'debug'
}

const currentLevel = (): number => LEVEL_PRIO[getLevel()]

function fmt(tag: string, msg: string): string {
  return `[${tag}] ${msg}`
}

export const logger = {
  debug(tag: string, msg: string, ...args: unknown[]): void {
    if (currentLevel() <= LEVEL_PRIO.debug) console.log(fmt(tag, msg), ...args)
  },

  info(tag: string, msg: string, ...args: unknown[]): void {
    if (currentLevel() <= LEVEL_PRIO.info) console.log(fmt(tag, msg), ...args)
  },

  warn(tag: string, msg: string, ...args: unknown[]): void {
    if (currentLevel() <= LEVEL_PRIO.warn) console.warn(fmt(tag, msg), ...args)
  },

  error(tag: string, msg: string, ...args: unknown[]): void {
    if (currentLevel() <= LEVEL_PRIO.error) console.error(fmt(tag, msg), ...args)
  },
}
