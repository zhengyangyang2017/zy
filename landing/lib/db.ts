import { createClient, type Client } from '@libsql/client'

let client: Client | null = null

export function getDb(): Client {
  if (client) return client

  const url = process.env.TURSO_DATABASE_URL
  const authToken = process.env.TURSO_AUTH_TOKEN

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables are required')
  }

  client = createClient({ url, authToken })
  return client
}

export async function initSchema(): Promise<void> {
  const db = getDb()

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      tier TEXT NOT NULL CHECK(tier IN ('pro', 'enterprise')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled')),
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      payment_provider TEXT,
      payment_order_id TEXT
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS activation_tokens (
      token TEXT PRIMARY KEY,
      license_id TEXT NOT NULL REFERENCES licenses(id),
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      device_id TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sms_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `)

  // Indexes
  await db.execute('CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id)')
  await db.execute('CREATE INDEX IF NOT EXISTS idx_activation_tokens_license_id ON activation_tokens(license_id)')
  await db.execute('CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)')
  await db.execute('CREATE INDEX IF NOT EXISTS idx_sms_codes_phone ON sms_codes(phone)')
}
