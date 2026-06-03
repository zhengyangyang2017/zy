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

    const activation = db.prepare(`
      SELECT token, license_id, used FROM activation_tokens
      WHERE token = ? AND used = 0 AND expires_at > datetime('now')
    `).get(activation_token) as { token: string; license_id: string; used: number } | undefined

    if (!activation) {
      return NextResponse.json({ error: '激活令牌无效或已过期' }, { status: 401 })
    }

    db.prepare('UPDATE activation_tokens SET used = 1 WHERE token = ?').run(activation.token)

    const license = db.prepare(`
      SELECT l.user_id, l.tier FROM licenses l
      WHERE l.id = ? AND l.status = 'active' AND l.expires_at > datetime('now')
    `).get(activation.license_id) as { user_id: string; tier: string } | undefined

    if (!license) {
      return NextResponse.json({ error: '许可证已过期或已取消' }, { status: 410 })
    }

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
