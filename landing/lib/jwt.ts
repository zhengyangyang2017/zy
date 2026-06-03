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
