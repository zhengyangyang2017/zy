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

export interface RefreshTokenPayload {
  sub: string
  device_id: string
  type: 'refresh'
  iat?: number
  exp?: number
}

export function signAccessToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })
}

export function signRefreshToken(userId: string, deviceId?: string): string {
  return jwt.sign(
    { sub: userId, device_id: deviceId ?? '', type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  )
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, JWT_SECRET) as RefreshTokenPayload
}

// Keep verifyToken for backward compat — delegates to verifyAccessToken
export function verifyToken(token: string): TokenPayload {
  return verifyAccessToken(token)
}

export function getTokenExpiry(token: string): number | null {
  const decoded = jwt.decode(token) as { exp?: number } | null
  return decoded?.exp ? decoded.exp * 1000 : null
}
