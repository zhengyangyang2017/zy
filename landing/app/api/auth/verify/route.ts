import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { signAccessToken, signRefreshToken } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json()

    if (!phone || !code) {
      return NextResponse.json({ error: '手机号和验证码不能为空' }, { status: 400 })
    }

    const db = getDb()

    const record = db.prepare(`
      SELECT id FROM sms_codes
      WHERE phone = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
      ORDER BY created_at DESC LIMIT 1
    `).get(phone, code) as { id: string } | undefined

    if (!record) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 401 })
    }

    db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(record.id)

    let user = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone) as { id: string } | undefined

    if (!user) {
      const userId = crypto.randomUUID()
      db.prepare('INSERT INTO users (id, phone, last_login_at) VALUES (?, ?, datetime(\'now\'))')
        .run(userId, phone)
      user = { id: userId }
    } else {
      db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?').run(user.id)
    }

    const license = db.prepare(`
      SELECT tier FROM licenses WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
      ORDER BY expires_at DESC LIMIT 1
    `).get(user.id) as { tier: string } | undefined

    const tier = license?.tier || 'free'
    const trial = !license

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
