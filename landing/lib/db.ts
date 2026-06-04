import { sql } from '@vercel/postgres'

export async function initSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      tier TEXT NOT NULL CHECK(tier IN ('pro', 'enterprise')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'cancelled')),
      started_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payment_provider TEXT,
      payment_order_id TEXT
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS activation_tokens (
      token TEXT PRIMARY KEY,
      license_id TEXT NOT NULL REFERENCES licenses(id),
      used INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      device_id TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS sms_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses(user_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_activation_tokens_license_id ON activation_tokens(license_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_sms_codes_phone ON sms_codes(phone)`
}
