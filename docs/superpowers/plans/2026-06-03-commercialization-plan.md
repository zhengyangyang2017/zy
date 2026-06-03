# Commercialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add monetization infrastructure: license verification system (server + client), feature tiering gates, and a public landing page.

**Architecture:** Vercel-hosted Next.js backend handles auth (phone/SMS), license issuance, and payments. Electron main process stores JWT tokens via existing `secure-store.ts` and checks license status on startup. Feature gates inject into the existing ClusterOrchestrator and LearningOrchestrator. A Next.js landing page with Tailwind CSS serves as the public-facing site.

**Tech Stack:** Next.js 14 (App Router) + Tailwind CSS for landing/API, better-sqlite3 (existing) for local license state, JWT (jsonwebtoken) for tokens, existing Electron + React + Zustand for client.

---

## Phase 1: License Service Backend (Vercel)

### Task 1: Initialize Next.js project for landing + API

**Files:**
- Create: `landing/package.json`
- Create: `landing/tsconfig.json`
- Create: `landing/next.config.js`
- Create: `landing/tailwind.config.ts`
- Create: `landing/postcss.config.js`
- Create: `landing/app/layout.tsx`
- Create: `landing/app/globals.css`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "claude-code-gui-landing",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "jsonwebtoken": "^9.0.0",
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/jsonwebtoken": "^9.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "typescript": "^5.6.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

- [ ] **Step 2: Run npm install**

Run: `cd landing && npm install`
Expected: dependencies install successfully

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create next.config.js**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
}
module.exports = nextConfig
```

- [ ] **Step 5: Create tailwind.config.ts + postcss.config.js**

`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0a0a14',
        primary: '#6366f1',
        accent: '#8b5cf6',
      }
    }
  },
  plugins: [],
}
export default config
```

`postcss.config.js`:
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Create globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html { scroll-behavior: smooth; }
body { @apply bg-surface text-white antialiased; }
```

- [ ] **Step 7: Create root layout**

`landing/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CodeBuddy — AI 编程助手，比你更懂你的代码库',
  description: '20个智能体协同工作 · 知识图谱持久记忆 · 自带API Key零隐私风险',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
```

- [ ] **Step 8: Commit**

```bash
cd landing && git init && git add -A && git commit -m "feat: init Next.js landing page project"
```

(Note: landing/ will be a separate git repo or subdirectory; handle git setup appropriately)

---

### Task 2: Database + JWT utility for license server

**Files:**
- Create: `landing/lib/db.ts`
- Create: `landing/lib/jwt.ts`

- [ ] **Step 1: Create database module**

`landing/lib/db.ts`:
```ts
import Database from 'better-sqlite3'
import path from 'path'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dbPath = path.join(process.cwd(), 'data', 'license.db')
  // Ensure data directory exists
  const fs = require('fs')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema(db)
  return db
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

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
    );

    CREATE TABLE IF NOT EXISTS activation_tokens (
      token TEXT PRIMARY KEY,
      license_id TEXT NOT NULL REFERENCES licenses(id),
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL,
      device_id TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sms_codes (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `)
}
```

- [ ] **Step 2: Create JWT utility**

`landing/lib/jwt.ts`:
```ts
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY = '30d'

export interface TokenPayload {
  sub: string       // user_id
  tier: string      // 'free' | 'pro' | 'enterprise'
  trial: boolean
  iat?: number
  exp?: number
}

export function signAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })
}

export function signRefreshToken(userId: string, deviceId?: string): string {
  return jwt.sign(
    { sub: userId, device_id: deviceId || '', type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  )
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload
}

export function getTokenExpiry(token: string): number {
  const decoded = jwt.decode(token) as { exp: number }
  return decoded.exp * 1000 // return ms timestamp
}
```

- [ ] **Step 3: Commit**

```bash
cd landing && git add -A && git commit -m "feat: add db schema and JWT utility"
```

---

### Task 3: Auth API routes (SMS + verify + refresh)

**Files:**
- Create: `landing/app/api/auth/send-code/route.ts`
- Create: `landing/app/api/auth/verify/route.ts`
- Create: `landing/app/api/auth/refresh/route.ts`

- [ ] **Step 1: Create send-code route**

`landing/app/api/auth/send-code/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import crypto from 'crypto'

// Rate limit: max 3 codes per phone per hour
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 3

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json()

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 })
    }

    const db = getDb()

    // Check rate limit
    const recentCount = db.prepare(`
      SELECT COUNT(*) as count FROM sms_codes
      WHERE phone = ? AND created_at > datetime('now', '-1 hour')
    `).get(phone) as { count: number }

    if (recentCount.count >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: '发送过于频繁，请1小时后再试' }, { status: 429 })
    }

    // Generate 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000))

    // Store code (15 min expiry)
    const id = crypto.randomUUID()
    db.prepare(`
      INSERT INTO sms_codes (id, phone, code, expires_at)
      VALUES (?, ?, ?, datetime('now', '+15 minutes'))
    `).run(id, phone, code)

    // TODO: Integrate real SMS provider (Alibaba Cloud SMS / Tencent Cloud SMS)
    // For development, log the code to console
    console.log(`[SMS] Code for ${phone}: ${code}`)

    return NextResponse.json({ success: true, message: '验证码已发送' })
  } catch (err) {
    console.error('[send-code]', err)
    return NextResponse.json({ error: '发送失败，请稍后重试' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create verify route**

`landing/app/api/auth/verify/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { signAccessToken, signRefreshToken } from '@/lib/jwt'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json()

    if (!phone || !code) {
      return NextResponse.json({ error: '手机号和验证码不能为空' }, { status: 400 })
    }

    const db = getDb()

    // Verify code
    const record = db.prepare(`
      SELECT id FROM sms_codes
      WHERE phone = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(phone, code) as { id: string } | undefined

    if (!record) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 401 })
    }

    // Mark code as used
    db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(record.id)

    // Find or create user
    let user = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone) as { id: string } | undefined

    if (!user) {
      const userId = crypto.randomUUID()
      db.prepare('INSERT INTO users (id, phone, last_login_at) VALUES (?, ?, datetime(\'now\'))')
        .run(userId, phone)
      user = { id: userId }
    } else {
      db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(user.id)
    }

    // Determine tier: check active license
    const license = db.prepare(`
      SELECT tier FROM licenses WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
      ORDER BY expires_at DESC LIMIT 1
    `).get(user.id) as { tier: string } | undefined

    const tier = license?.tier || 'free'
    const trial = !license

    // Issue tokens
    const accessToken = signAccessToken({ sub: user.id, tier, trial })
    const refreshToken = signRefreshToken(user.id)

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      tier,
      trial,
    })
  } catch (err) {
    console.error('[verify]', err)
    return NextResponse.json({ error: '验证失败' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create refresh route**

`landing/app/api/auth/refresh/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { verifyToken, signAccessToken, TokenPayload } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  try {
    const { refresh_token } = await req.json()

    if (!refresh_token) {
      return NextResponse.json({ error: '缺少 refresh_token' }, { status: 400 })
    }

    // Verify refresh token
    let payload: TokenPayload
    try {
      payload = verifyToken(refresh_token)
      if ((payload as any).type !== 'refresh') {
        throw new Error('Not a refresh token')
      }
    } catch {
      return NextResponse.json({ error: 'refresh_token 无效或已过期' }, { status: 401 })
    }

    const db = getDb()

    // Check user still exists and get current tier
    const license = db.prepare(`
      SELECT tier FROM licenses WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
      ORDER BY expires_at DESC LIMIT 1
    `).get(payload.sub) as { tier: string } | undefined

    const tier = license?.tier || 'free'
    const trial = !license

    const newAccessToken = signAccessToken({ sub: payload.sub, tier, trial })

    return NextResponse.json({
      access_token: newAccessToken,
      tier,
      trial,
    })
  } catch (err) {
    console.error('[refresh]', err)
    return NextResponse.json({ error: '刷新失败' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd landing && git add -A && git commit -m "feat: add auth API routes (send-code, verify, refresh)"
```

---

### Task 4: License API routes (activate + verify)

**Files:**
- Create: `landing/app/api/license/activate/route.ts`
- Create: `landing/app/api/license/verify/route.ts`

- [ ] **Step 1: Create activate route**

`landing/app/api/license/activate/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { signAccessToken, signRefreshToken } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  try {
    const { activation_token } = await req.json()

    if (!activation_token) {
      return NextResponse.json({ error: '缺少激活令牌' }, { status: 400 })
    }

    const db = getDb()

    // Find and validate activation token
    const activation = db.prepare(`
      SELECT token, license_id, used FROM activation_tokens
      WHERE token = ? AND used = 0 AND expires_at > datetime('now')
    `).get(activation_token) as { token: string; license_id: string; used: number } | undefined

    if (!activation) {
      return NextResponse.json({ error: '激活令牌无效或已过期' }, { status: 401 })
    }

    // Mark token as used
    db.prepare('UPDATE activation_tokens SET used = 1 WHERE token = ?').run(activation.token)

    // Get license + user info
    const license = db.prepare(`
      SELECT l.user_id, l.tier FROM licenses l
      WHERE l.id = ? AND l.status = 'active' AND l.expires_at > datetime('now')
    `).get(activation.license_id) as { user_id: string; tier: string } | undefined

    if (!license) {
      return NextResponse.json({ error: '许可证已过期或已取消' }, { status: 410 })
    }

    // Issue JWT tokens
    const accessToken = signAccessToken({ sub: license.user_id, tier: license.tier, trial: false })
    const refreshToken = signRefreshToken(license.user_id)

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      tier: license.tier,
      trial: false,
    })
  } catch (err) {
    console.error('[activate]', err)
    return NextResponse.json({ error: '激活失败' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create verify route**

`landing/app/api/license/verify/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { verifyToken, TokenPayload } from '@/lib/jwt'
import { signAccessToken } from '@/lib/jwt'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      return NextResponse.json({ error: '未提供认证令牌' }, { status: 401 })
    }

    let payload: TokenPayload
    try {
      payload = verifyToken(token)
    } catch {
      return NextResponse.json({ valid: false, error: '令牌已过期' }, { status: 401 })
    }

    // Re-check license status from DB (handles revocation)
    const db = getDb()
    const license = db.prepare(`
      SELECT tier FROM licenses WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
      ORDER BY expires_at DESC LIMIT 1
    `).get(payload.sub) as { tier: string } | undefined

    const effectiveTier = license?.tier || 'free'
    const trial = !license

    // Issue a fresh access token
    const newToken = signAccessToken({ sub: payload.sub, tier: effectiveTier, trial })

    return NextResponse.json({
      valid: true,
      tier: effectiveTier,
      trial,
      access_token: newToken,
    })
  } catch (err) {
    console.error('[verify]', err)
    return NextResponse.json({ error: '验证失败' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd landing && git add -A && git commit -m "feat: add license API routes (activate, verify)"
```

---

## Phase 2: License Client (Electron Main Process)

### Task 5: License service for Electron main process

**Files:**
- Create: `src/main/services/license.ts`

- [ ] **Step 1: Create license service**

`src/main/services/license.ts`:
```ts
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
      userId: data.sub || '',
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
      userId: data.sub || '',
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
  // Ensure kv_store table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
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

  // If within grace period, use cached tier from JWT payload
  if (offlineDuration < OFFLINE_GRACE_MS) {
    try {
      const payload = JSON.parse(atob(tokens.accessToken.split('.')[1])) as {
        sub: string; tier: string; trial: boolean; exp: number
      }

      // Check if access token is still valid
      if (payload.exp * 1000 > now) {
        return {
          tier: payload.tier as LicenseStatus['tier'],
          trial: payload.trial,
          userId: payload.sub,
        }
      }

      // Try refresh
      const refreshed = await refreshTokens(tokens)
      return refreshed
    } catch {
      // Fall through to trial check
    }
  }

  // Offline grace expired: require online check
  try {
    return await onlineVerify(tokens)
  } catch {
    // Server unreachable and grace expired: downgrade to free
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
    // Token expired, try refresh
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
      await refreshTokens(tokens)
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main/services/license.ts
git commit -m "feat: add license service for Electron main process"
```

---

### Task 6: Wire license into app lifecycle

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add license initialization to index.ts**

In `src/main/index.ts`, add import near other service imports (line 22):
```ts
import { initLicense, shutdownLicense, getLicenseStatus } from './services/license'
```

In `app.whenReady().then(...)` block, add after `registerIpcHandlers()` (after line 86):
```ts
  // Initialize license (trial or stored tokens)
  initLicense().then(status => {
    logger.info('Main', `License: tier=${status.tier} trial=${status.trial}`)
  }).catch(err => {
    logger.error('Main', 'License init failed:', err)
  })
```

In `app.on('window-all-closed', ...)` block, add before `stopScheduler()`:
```ts
  shutdownLicense()
```

- [ ] **Step 2: Add IPC handlers for license**

In `src/main/ipc.ts`, add import:
```ts
import { initLicense, getLicenseStatus, activateLicense, loginWithPhone, logout } from './services/license'
```

Add handlers at the end of `registerIpcHandlers()` (before the closing `}`):
```ts
  // License
  ipcMain.handle('license:status', async () => {
    return getLicenseStatus()
  })

  ipcMain.handle('license:activate', async (_e, activationToken: string) => {
    return activateLicense(activationToken)
  })

  ipcMain.handle('license:login', async (_e, phone: string, code: string) => {
    return loginWithPhone(phone, code)
  })

  ipcMain.handle('license:logout', async () => {
    logout()
    return getLicenseStatus()
  })

  ipcMain.handle('license:sendCode', async (_e, phone: string) => {
    const res = await fetch('https://your-app.vercel.app/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(err.error || '发送失败')
    }
    return await res.json()
  })
```

- [ ] **Step 3: Add preload API**

In `src/preload/index.ts`, add these entries inside the `api` object (before the closing `}` at line 168):
```ts
  // License & Auth
  getLicenseStatus: () =>
    ipcRenderer.invoke('license:status'),

  activateLicense: (activationToken: string) =>
    ipcRenderer.invoke('license:activate', activationToken),

  loginWithPhone: (phone: string, code: string) =>
    ipcRenderer.invoke('license:login', phone, code),

  logout: () =>
    ipcRenderer.invoke('license:logout'),

  sendSmsCode: (phone: string) =>
    ipcRenderer.invoke('license:sendCode', phone),
```

- [ ] **Step 4: Add type declarations**

Create `src/types/license.ts`:
```ts
export interface LicenseStatus {
  tier: 'free' | 'pro' | 'enterprise'
  trial: boolean
  daysRemaining?: number
  userId?: string
}
```

The `LicenseStatus` type is already defined in `src/types/license.ts` (created above). Import from there wherever needed rather than duplicating in ipc.ts.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/ipc.ts src/preload/index.ts src/types/license.ts src/types/ipc.ts
git commit -m "feat: wire license service into app lifecycle and IPC"
```

---

## Phase 3: Feature Tiering

### Task 7: Add license gates to LearningOrchestrator

**Files:**
- Modify: `src/main/services/learning/orchestrator.ts`

- [ ] **Step 1: Add license check to onConversationTurn**

In `src/main/services/learning/orchestrator.ts`, add import:
```ts
import { getLicenseStatus } from '../license'
```

Modify the `onConversationTurn` function to gate on license:
```ts
export async function onConversationTurn(
  sessionId: string,
  userMessage: string,
  assistantResponse: string
): Promise<void> {
  // Gate: only Pro/Enterprise users get knowledge extraction
  const { tier } = getLicenseStatus()
  if (tier === 'free') {
    return // Free tier: skip knowledge graph extraction
  }

  const buffer = sessionBuffer.get(sessionId) || []
  const now = new Date().toISOString()

  buffer.push({ role: 'user', content: userMessage, timestamp: now })
  buffer.push({ role: 'assistant', content: assistantResponse, timestamp: now })
  sessionBuffer.set(sessionId, buffer)

  // Trigger extraction if threshold met and not already processing
  if (buffer.length >= BUFFER_THRESHOLD && !processingSessions.has(sessionId)) {
    processingSessions.add(sessionId)
    // ... rest of existing logic unchanged
  }
}
```

- [ ] **Step 2: Add license check to knowledge retrieval (injectKnowledgeContext)**

Find the `injectKnowledgeContext` function (or equivalent) and add gate:
```ts
export async function injectKnowledgeContext(sessionId: string): Promise<string> {
  const { tier } = getLicenseStatus()
  if (tier === 'free') return '' // Free: no knowledge injection

  // ... existing retrieval logic
}
```

- [ ] **Step 3: Add license check to research agent triggers**

Find any research agent entry points and add:
```ts
const { tier } = getLicenseStatus()
if (tier === 'free') return
```

- [ ] **Step 4: Commit**

```bash
git add src/main/services/learning/orchestrator.ts
git commit -m "feat: add license gates to learning orchestrator"
```

---

### Task 8: Add agent count gating to cluster

**Files:**
- Modify: `src/main/services/cluster/orchestrator.ts`
- Modify: `src/main/index.ts` (minor)

- [ ] **Step 1: Add license check when starting cluster**

In `src/main/index.ts`, modify the cluster start block (lines 100-108):
```ts
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
```

- [ ] **Step 2: No changes needed in orchestrator.ts**

The `ClusterOrchestrator` constructor already accepts `Partial<ClusterConfig>` with `agentCount`. The change in step 1 is sufficient to gate agent count.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: gate agent count by license tier (3 free, 20 pro)"
```

---

## Phase 4: UI Components

### Task 9: Trial banner component

**Files:**
- Create: `src/renderer/components/auth/TrialBanner.tsx`

- [ ] **Step 1: Create TrialBanner component**

`src/renderer/components/auth/TrialBanner.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import type { LicenseStatus } from '../../../types/license'

export function TrialBanner() {
  const { t } = useI18n()
  const [status, setStatus] = useState<LicenseStatus | null>(null)

  useEffect(() => {
    window.api.getLicenseStatus().then(setStatus).catch(() => {})
  }, [])

  if (!status || !status.trial || !status.daysRemaining) return null

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-b border-purple-500/30">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-purple-400">🎉</span>
        <span className="text-white">
          Pro 试用还剩 <strong className="text-purple-300">{status.daysRemaining}</strong> 天
        </span>
      </div>
      <a
        href="https://your-app.vercel.app/#pricing"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded-md transition-colors"
      >
        订阅仅需 ¥15/月
      </a>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/auth/TrialBanner.tsx
git commit -m "feat: add trial banner component"
```

---

### Task 10: Login modal component

**Files:**
- Create: `src/renderer/components/auth/LoginModal.tsx`

- [ ] **Step 1: Create LoginModal**

`src/renderer/components/auth/LoginModal.tsx`:
```tsx
import { useState, useCallback } from 'react'
import { useI18n } from '../../i18n'

interface Props {
  open: boolean
  onClose: () => void
  onLoginSuccess: () => void
}

export function LoginModal({ open, onClose, onLoginSuccess }: Props) {
  const { t } = useI18n()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)

  const sendCode = useCallback(async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入正确的手机号')
      return
    }
    setSending(true)
    setError('')
    try {
      await window.api.sendSmsCode(phone)
      setCodeSent(true)
      setCountdown(60)
      const timer = setInterval(() => {
        setCountdown((c) => { if (c <= 1) { clearInterval(timer); return 0 }; return c - 1 })
      }, 1000)
    } catch (e: any) {
      setError(e.message || '发送失败')
    } finally {
      setSending(false)
    }
  }, [phone])

  const login = useCallback(async () => {
    if (!code || code.length !== 6) {
      setError('请输入6位验证码')
      return
    }
    setLoading(true)
    setError('')
    try {
      await window.api.loginWithPhone(phone, code)
      onLoginSuccess()
      onClose()
    } catch (e: any) {
      setError(e.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }, [phone, code, onLoginSuccess, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-hover rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">登录 / 注册</h2>

        <label className="block text-xs text-text-muted mb-1">手机号</label>
        <input
          type="tel"
          maxLength={11}
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setError('') }}
          placeholder="输入手机号"
          className="w-full bg-background border border-hover rounded-md px-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-primary mb-3"
        />

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            maxLength={6}
            value={code}
            onChange={(e) => { setCode(e.target.value); setError('') }}
            placeholder="验证码"
            className="flex-1 bg-background border border-hover rounded-md px-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-primary"
          />
          <button
            onClick={sendCode}
            disabled={sending || countdown > 0 || !phone}
            className="text-xs bg-primary/20 hover:bg-primary/30 text-primary px-3 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {countdown > 0 ? `${countdown}s` : sending ? '发送中...' : '获取验证码'}
          </button>
        </div>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <button
          onClick={login}
          disabled={loading || !code}
          className="w-full bg-primary hover:bg-primary/90 text-white py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? '登录中...' : '登录 / 注册'}
        </button>

        <button
          onClick={onClose}
          className="w-full mt-2 text-xs text-text-muted hover:text-white py-1 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/auth/LoginModal.tsx
git commit -m "feat: add login modal component"
```

---

### Task 11: Integrate UI components into AppShell

**Files:**
- Modify: `src/components/shell/AppShell.tsx`
- Modify: `src/components/shell/StatusBar.tsx`

- [ ] **Step 1: Integrate TrialBanner and LoginModal into AppShell**

Read `src/components/shell/AppShell.tsx` first. Add TrialBanner between TitleBar and the main content area, and include LoginModal. Add state for login modal visibility.

Add imports:
```tsx
import { TrialBanner } from '../auth/TrialBanner'
import { LoginModal } from '../auth/LoginModal'
```

Add state and the components in the JSX structure. The TrialBanner should sit below the TitleBar, and the LoginModal should be rendered at the top level.

- [ ] **Step 2: Add tier badge to StatusBar**

In `src/components/shell/StatusBar.tsx`, add license status polling and display:

Add import:
```tsx
import type { LicenseStatus } from '../../types/license'
```

Add state:
```tsx
const [license, setLicense] = useState<LicenseStatus | null>(null)
```

Add polling effect:
```tsx
useEffect(() => {
  const poll = () => {
    window.api.getLicenseStatus().then(setLicense).catch(() => {})
  }
  poll()
  const interval = setInterval(poll, 30000)
  return () => clearInterval(interval)
}, [])
```

Add tier badge in the right-side info area (before the `activeSessionId` check):
```tsx
{license && (
  <span className={`text-[10px] flex items-center gap-1 ml-3 px-1.5 py-0.5 rounded ${
    license.tier === 'pro' || license.tier === 'enterprise'
      ? 'bg-purple-500/20 text-purple-300'
      : 'bg-text-muted/20 text-text-muted'
  }`}>
    {license.trial ? '🧪 试用中' : license.tier === 'pro' ? '⭐ Pro' : license.tier === 'enterprise' ? '🏢 企业' : '免费版'}
  </span>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/AppShell.tsx src/components/shell/StatusBar.tsx
git commit -m "feat: integrate trial banner, login modal, and tier badge into shell"
```

---

## Phase 5: Landing Page

### Task 12: Landing page main content

**Files:**
- Create: `landing/app/page.tsx`
- Create: `landing/components/Hero.tsx`
- Create: `landing/components/Features.tsx`
- Create: `landing/components/Pricing.tsx`
- Create: `landing/components/FAQ.tsx`

- [ ] **Step 1: Create Hero component**

`landing/components/Hero.tsx`:
```tsx
export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 py-24 text-center">
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 to-transparent pointer-events-none" />
      <div className="relative max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
          AI 编程助手，
          <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            比你更懂你的代码库
          </span>
        </h1>
        <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
          20个智能体协同工作 · 知识图谱持久记忆 · 自带API Key零隐私风险
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <a
            href="#download"
            className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            免费下载
          </a>
          <a
            href="#pricing"
            className="border border-gray-600 hover:border-gray-400 text-gray-300 px-6 py-3 rounded-lg font-medium transition-colors"
          >
            查看定价
          </a>
        </div>
        <p className="text-xs text-gray-600 mt-4">Windows · macOS · Linux</p>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create Features component**

`landing/components/Features.tsx`:
```tsx
const FEATURES = [
  {
    icon: '🧠',
    title: '20 Agent 集群',
    desc: '代码生成、审查、研究并行处理，复杂任务自动分解为工作流DAG执行',
  },
  {
    icon: '📚',
    title: '知识图谱',
    desc: '自动从对话中提取知识，向量+关键词混合检索，让AI越用越了解你的项目',
  },
  {
    icon: '🔒',
    title: '数据本地化',
    desc: '自带API Key，代码不离开你的设备。所有数据存储在本地SQLite，隐私零风险',
  },
  {
    icon: '🔄',
    title: '自进化系统',
    desc: 'AI分析回答质量，自动调整策略。准确率、完整性、简洁度持续优化',
  },
  {
    icon: '💻',
    title: '内置终端',
    desc: 'xterm + node-pty真实终端，支持交互式命令，不用离开编辑器',
  },
  {
    icon: '🌐',
    title: '多厂商支持',
    desc: '支持Anthropic、OpenAI、DeepSeek及任何兼容API，自由选择模型',
  },
]

export function Features() {
  return (
    <section id="features" className="px-6 py-20 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-white text-center mb-12">核心功能</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map((f) => (
          <div key={f.title} className="bg-white/5 border border-gray-700/50 rounded-xl p-6 hover:border-gray-600 transition-colors">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create Pricing component**

`landing/components/Pricing.tsx`:
```tsx
export function Pricing() {
  return (
    <section id="pricing" className="px-6 py-20 max-w-5xl mx-auto">
      <h2 className="text-3xl font-bold text-white text-center mb-4">简单定价</h2>
      <p className="text-gray-400 text-center mb-12">自带API Key，我们只收工具费</p>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Free */}
        <div className="bg-white/5 border border-gray-700/50 rounded-xl p-8">
          <h3 className="text-xl font-semibold text-white mb-2">免费版</h3>
          <p className="text-3xl font-bold text-white mb-1">¥0</p>
          <p className="text-sm text-gray-500 mb-6">永久免费</p>
          <ul className="space-y-3 mb-8">
            <li className="text-sm text-gray-400">✅ 基础AI对话</li>
            <li className="text-sm text-gray-400">✅ 3 Agent并行</li>
            <li className="text-sm text-gray-400">✅ 文件/终端/Git</li>
            <li className="text-sm text-gray-400">✅ 自带API Key</li>
            <li className="text-sm text-gray-600">❌ 知识图谱</li>
            <li className="text-sm text-gray-600">❌ 自进化系统</li>
          </ul>
          <a
            href="#download"
            className="block text-center border border-gray-600 hover:border-gray-400 text-gray-300 py-2 rounded-lg text-sm transition-colors"
          >
            免费下载
          </a>
        </div>

        {/* Pro */}
        <div className="bg-gradient-to-b from-purple-600/30 to-blue-600/30 border border-purple-500/50 rounded-xl p-8 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs px-3 py-1 rounded-full">
            推荐
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Pro 版</h3>
          <p className="text-3xl font-bold text-white mb-1">¥15<span className="text-lg font-normal text-gray-400">/月</span></p>
          <p className="text-sm text-gray-500 mb-6">或 ¥129/年 (8折)</p>
          <ul className="space-y-3 mb-8">
            <li className="text-sm text-gray-300">✅ 免费版全部功能</li>
            <li className="text-sm text-gray-300">✅ <strong>20 Agent集群</strong></li>
            <li className="text-sm text-gray-300">✅ <strong>知识图谱</strong></li>
            <li className="text-sm text-gray-300">✅ <strong>自进化系统</strong></li>
            <li className="text-sm text-gray-300">✅ 无限知识库容量</li>
            <li className="text-sm text-gray-300">✅ 7天免费试用</li>
          </ul>
          <a
            href="/subscribe"
            className="block text-center bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            开始试用
          </a>
        </div>

        {/* Enterprise */}
        <div className="bg-white/5 border border-gray-700/50 rounded-xl p-8">
          <h3 className="text-xl font-semibold text-white mb-2">企业版</h3>
          <p className="text-3xl font-bold text-white mb-1">联系我们</p>
          <p className="text-sm text-gray-500 mb-6">5席位起 · 按年签约</p>
          <ul className="space-y-3 mb-8">
            <li className="text-sm text-gray-400">✅ Pro版全部功能</li>
            <li className="text-sm text-gray-400">✅ 团队知识共享</li>
            <li className="text-sm text-gray-400">✅ SSO统一登录</li>
            <li className="text-sm text-gray-400">✅ 管理后台</li>
            <li className="text-sm text-gray-400">✅ 私有化部署</li>
          </ul>
          <a
            href="mailto:sales@example.com"
            className="block text-center border border-gray-600 hover:border-gray-400 text-gray-300 py-2 rounded-lg text-sm transition-colors"
          >
            联系销售
          </a>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create FAQ component**

`landing/components/FAQ.tsx`:
```tsx
const FAQS = [
  { q: '和 Cursor、Copilot 有什么区别？', a: 'CodeBuddy 是桌面端工具，数据完全本地化，你自带API Key。Cursor/Copilot 是IDE插件，数据走云端。我们的20 Agent集群和知识图谱功能是独有的。' },
  { q: '免费版够用吗？', a: '免费版支持3个Agent并行、AI对话、文件管理、Git和终端。个人日常开发完全够用。Pro版解锁知识图谱和20个Agent集群，适合深度用户。' },
  { q: '我的代码会上传到你们的服务器吗？', a: '不会。所有数据存储在本地SQLite数据库，API调用直接从你的设备到你选择的AI服务商。我们不代理、不存储、不上传。' },
  { q: '支持哪些模型？', a: '支持Anthropic Claude、OpenAI GPT、DeepSeek，以及任何OpenAI兼容API。你可以随时切换。' },
  { q: '如何订阅 Pro？', a: '在App内点击订阅，或在网站上购买。支持微信支付和支付宝。付款后自动激活，无需手动输入License Key。' },
]

export function FAQ() {
  return (
    <section id="faq" className="px-6 py-20 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-white text-center mb-12">常见问题</h2>
      <div className="space-y-4">
        {FAQS.map((faq) => (
          <details key={faq.q} className="bg-white/5 border border-gray-700/50 rounded-xl p-4 group">
            <summary className="text-white font-medium cursor-pointer list-none flex justify-between items-center">
              {faq.q}
              <span className="text-gray-500 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <p className="text-sm text-gray-400 mt-3 leading-relaxed">{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Create main page**

`landing/app/page.tsx`:
```tsx
import { Hero } from '@/components/Hero'
import { Features } from '@/components/Features'
import { Pricing } from '@/components/Pricing'
import { FAQ } from '@/components/FAQ'

export default function Home() {
  return (
    <main className="min-h-screen bg-surface">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-lg font-bold text-white">🔤 CodeBuddy</span>
        <div className="flex gap-6 text-sm text-gray-400">
          <a href="#features" className="hover:text-white transition-colors">功能</a>
          <a href="#pricing" className="hover:text-white transition-colors">定价</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
        </div>
      </nav>
      <Hero />
      <Features />
      <Pricing />
      <FAQ />
      <footer className="text-center py-12 text-xs text-gray-600 border-t border-gray-800">
        <p>© 2026 CodeBuddy. Built with ❤️ for developers.</p>
        <p className="mt-1">ICP备XXXXXXXX号-X | 联系我们: hi@example.com</p>
      </footer>
    </main>
  )
}
```

- [ ] **Step 6: Commit**

```bash
cd landing && git add -A && git commit -m "feat: add landing page with hero, features, pricing, FAQ"
```

---

### Task 13: Final integration and custom protocol handler

**Files:**
- Modify: `src/main/index.ts` (add protocol handler)

- [ ] **Step 1: Register custom protocol for activation**

In `src/main/index.ts`, add after `app.whenReady()` setup (after the main block), add protocol registration:
```ts
// Register custom protocol for license activation
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('codebuddy', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('codebuddy')
}
```

Add protocol handler for macOS (app.on('open-url')) and Windows/Linux (app.on('second-instance')):
```ts
// Handle custom protocol on macOS
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleActivationUrl(url)
})

// Handle custom protocol on Windows/Linux (single instance)
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
    if (parsed.pathname === 'activate') {
      const token = parsed.searchParams.get('token')
      if (token) {
        import('./services/license').then(({ activateLicense }) => {
          activateLicense(token).then(status => {
            logger.info('Main', `Activated via protocol: tier=${status.tier}`)
            // Notify renderer
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add custom protocol handler for license activation"
```

---

## Implementation Order

1. **Phase 1 (Tasks 1-4)**: License Service Backend — independent, can be done first
2. **Phase 2 (Tasks 5-6)**: License Client — depends on Phase 1 API endpoints existing
3. **Phase 3 (Tasks 7-8)**: Feature Tiering — depends on Phase 2 license service
4. **Phase 4 (Tasks 9-11)**: UI Components — depends on Phase 2 preload API
5. **Phase 5 (Tasks 12-13)**: Landing Page + Protocol — partially independent

Phases 1 and 5 can be worked on in parallel since they're independent projects.

---

## Post-Deployment Configuration

After Vercel deployment, update these placeholder values:

1. `LICENSE_SERVER_URL` in `src/main/services/license.ts` → actual Vercel domain
2. `your-app.vercel.app` in `src/renderer/components/auth/TrialBanner.tsx` and LoginModal → actual domain
3. `your-app.vercel.app` in `src/main/ipc.ts` (sendCode handler) → actual domain
4. `sales@example.com` / `hi@example.com` in landing page → real contact emails
5. ICP备案号 in footer → real number after filing
6. `JWT_SECRET` environment variable in Vercel dashboard → strong random secret
7. SMS provider integration in `landing/app/api/auth/send-code/route.ts` → Alibaba/Tencent Cloud SMS SDK
8. Add `.superpowers/` to `.gitignore`
