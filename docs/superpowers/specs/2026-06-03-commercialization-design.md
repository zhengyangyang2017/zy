# Commercialization Design: License + Landing Page + Feature Tiers

**Date**: 2026-06-03
**Status**: Draft
**Scope**: Add monetization infrastructure to Claude Code GUI — user accounts, license verification, feature tiering, and a public landing page.

---

## 1. Overview

Three subsystems to build:

1. **User Account + License System** — backend (Vercel Serverless) + frontend (Electron main process)
2. **Feature Tiering** — gating logic inside the existing Electron app
3. **Landing Page** — Next.js site deployed to Vercel with payment integration

---

## 2. User Account + License System

### 2.1 User Registration

- **Method**: Phone number + SMS verification code
- **Flow**: Enter phone → receive 6-digit code → verify → account created (auto-generate user ID)
- **SMS provider**: Alibaba Cloud SMS or Tencent Cloud SMS (domestic rates ~¥0.04/msg)

### 2.2 Authentication

- **Token scheme**: JWT Access Token (15min expiry) + Refresh Token (30 day expiry)
- **Storage**: Reuse existing `secure-store.ts` (DPAPI on Windows, Keychain on macOS) to encrypt tokens locally
- **Offline grace**: Store `last_online_check` timestamp. If < 7 days since last check, allow offline use. If ≥ 7 days, require online re-auth.

### 2.3 Payment → Activation Flow

```
1. User on Landing Page → clicks "Subscribe Pro"
2. Pays via WeChat Pay / Alipay
3. Payment callback → Server creates license record + generates activation token
4. Browser shows: "Open Claude Code GUI to activate" + button
5. Button triggers: codebuddy://activate?token=xxx (custom protocol)
6. Desktop app opens → receives token → POSTs to /api/activate
7. Server validates token → returns JWT access_token + refresh_token
8. App stores tokens via secure-store → Pro features unlocked
```

### 2.4 License Verification (Periodic)

```
- On app launch: check local JWT expiry → refresh if needed → verify online
- Every 24h: background refresh check
- Every API call to license server: validate JWT, return feature flags
- On expiry: Pro features disabled, user prompted to re-login
```

### 2.5 Trial System

```
- On first app launch: auto-generate trial license (7 days, all Pro features)
- Store trial_start_date in local SQLite
- Trial banner in UI: "Pro试用还剩X天 — 订阅仅需 ¥15/月"
- Trial expiry: features downgrade to Free tier, show subscription prompt
```

### 2.6 API Endpoints (Vercel Serverless)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/send-code` | POST | Send SMS verification code |
| `/api/auth/verify` | POST | Verify code → return JWT pair |
| `/api/auth/refresh` | POST | Refresh access token |
| `/api/license/activate` | POST | Activate with payment token → return JWT |
| `/api/license/verify` | GET | Verify JWT → return tier + features |
| `/api/payment/create-order` | POST | Create WeChat/Alipay order |
| `/api/payment/callback` | POST | Payment webhook from WeChat/Alipay |

---

## 3. Feature Tiering

### 3.1 Tier Definitions

| Feature | Free | Pro (¥15-19/月) | Enterprise (TBD) |
|---------|------|-----------------|-------------------|
| AI Chat | ✅ | ✅ | ✅ |
| Agent count | 3 | 20 | 20 |
| File panel | ✅ | ✅ | ✅ |
| Terminal | ✅ | ✅ | ✅ |
| Git panel | ✅ | ✅ | ✅ |
| Knowledge Graph | ❌ | ✅ | ✅ |
| Self-evolution | ❌ | ✅ | ✅ |
| Research Agent | ❌ | ✅ | ✅ |
| Knowledge capacity | N/A | Unlimited | Unlimited |
| Team sharing | ❌ | ❌ | ✅ |
| SSO | ❌ | ❌ | ✅ |
| Admin dashboard | ❌ | ❌ | ✅ |

### 3.2 Implementation Points (Feature Flags)

**Agent count gating** — `orchestrator.ts` already accepts `agentCount` in config. Set to 3 for Free, 20 for Pro.

```typescript
// In app startup, after license check:
const agentCount = license.tier === 'pro' ? 20 : 3
const orchestrator = new ClusterOrchestrator({ agentCount })
```

**Knowledge Graph gating** — Add license check in `LearningOrchestrator.onConversationTurn()`:

```typescript
// In src/main/services/learning/orchestrator.ts
export async function onConversationTurn(...): Promise<void> {
  const { tier } = await getLicenseStatus()
  if (tier === 'free') return // Free tier: skip knowledge extraction
  // ... existing logic
}
```

**Evolution Agent gating** — Same pattern, check license before running evolution analysis.

**UI indicators** — Show tier badge in StatusBar, grayed-out Pro features in settings with "Upgrade to Pro" link.

### 3.3 Trial Implementation

```typescript
// src/main/services/license.ts
export async function getLicenseStatus(): Promise<LicenseStatus> {
  // 1. Check for active license (Pro/Enterprise)
  const license = await loadStoredLicense()
  if (license && !isExpired(license)) return license

  // 2. Check for active trial
  const trial = await loadTrial()
  if (trial && trial.daysRemaining > 0) {
    return { tier: 'pro', trial: true, daysRemaining: trial.daysRemaining }
  }

  // 3. No trial yet → start trial
  if (!trial) {
    await startTrial(7)
    return { tier: 'pro', trial: true, daysRemaining: 7 }
  }

  // 4. Trial expired → Free
  return { tier: 'free', trial: false }
}
```

---

## 4. Landing Page

### 4.1 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Deployment**: Vercel (free tier)
- **Database**: Vercel Postgres or Turso (SQLite-compatible, free tier)
- **Payments**: WeChat Pay JSAPI + Alipay Web

### 4.2 Page Structure (Single Page Scroll)

```
1. Hero — headline + CTA (download) + OS badges
2. Features — 3-column grid: Agent Cluster / Knowledge Graph / Privacy
3. Comparison Table — vs Cursor / Copilot / Claude Code CLI
4. Pricing — Free / Pro / Enterprise cards
5. FAQ — 5-6 common questions
6. Footer — links, ICP备案, contact
```

### 4.3 Key Features

- OS detection for download button (Windows/macOS/Linux)
- Download count from GitHub Releases API
- Custom protocol registration (`codebuddy://`)
- Mobile responsive

---

## 5. File Changes Summary

### New Files (to create)

| File | Purpose |
|------|---------|
| `src/main/services/license.ts` | License verification, trial management, JWT storage |
| `src/main/services/user-auth.ts` | SMS auth flow from Electron main process |
| `src/renderer/components/auth/LoginModal.tsx` | Login UI modal |
| `src/renderer/components/auth/TrialBanner.tsx` | Trial countdown banner |
| `src/renderer/components/auth/UpgradePrompt.tsx` | Upgrade to Pro prompt |
| `landing/` (new top-level dir) | Next.js landing page project |
| `landing/app/page.tsx` | Landing page main |
| `landing/app/api/auth/*` | Auth API routes |
| `landing/app/api/license/*` | License API routes |
| `landing/app/api/payment/*` | Payment API routes |
| `landing/app/layout.tsx` | Root layout |
| `landing/package.json` | Dependencies |

### Modified Files (existing)

| File | Change |
|------|--------|
| `src/main/services/cluster/orchestrator.ts` | Accept `agentCount` from license |
| `src/main/services/learning/orchestrator.ts` | Add license check gate |
| `src/main/services/learning/evolution-agent.ts` | Add license check gate |
| `src/main/index.ts` | Initialize license service on startup |
| `src/main/ipc.ts` | Add auth/license IPC handlers |
| `src/preload/index.ts` | Expose auth/license APIs to renderer |
| `src/components/shell/StatusBar.tsx` | Show tier badge |
| `src/components/shell/AppShell.tsx` | Add trial banner + login modal |
| `src/stores/settingsStore.ts` | Add license state |

---

## 6. Security Considerations

- JWT secrets stored as Vercel environment variables (not in code)
- SMS rate limiting: max 3 codes per phone per hour
- Payment webhooks verified with WeChat/Alipay signature
- Activation tokens single-use, 10-minute expiry
- All license API calls over HTTPS
- Existing `secure-store.ts` reused for local token encryption

---

## 7. Testing Strategy

- Unit tests: license state machine (trial→pro→expired), JWT validation
- E2E tests: payment→activation flow (mock payment webhook)
- Manual: SMS verification flow, offline grace period
