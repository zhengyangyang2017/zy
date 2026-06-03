import { NextRequest, NextResponse } from 'next/server'
import { getDb, initSchema } from '@/lib/db'
import { signAccessToken, signRefreshToken } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json()

    if (!phone || !code) {
      return NextResponse.json({ error: '手机号和验证码不能为空' }, { status: 400 })
    }

    const db = getDb()
    await initSchema()

    // Rate limit: max 10 verification attempts per phone per 15 minutes
    const verifyResult = await db.execute({
      sql: `SELECT COUNT(*) as count FROM sms_codes
            WHERE phone = ? AND created_at > datetime('now', '-15 minutes')`,
      args: [phone],
    })
    const verifyAttempts = verifyResult.rows[0] as unknown as { count: number }

    if (verifyAttempts.count > 10) {
      return NextResponse.json({ error: '验证尝试过于频繁，请15分钟后再试' }, { status: 429 })
    }

    const codeResult = await db.execute({
      sql: `SELECT id FROM sms_codes
            WHERE phone = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
            ORDER BY created_at DESC LIMIT 1`,
      args: [phone, code],
    })
    const record = codeResult.rows[0] as unknown as { id: string } | undefined

    if (!record) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 401 })
    }

    await db.execute({ sql: 'UPDATE sms_codes SET used = 1 WHERE id = ?', args: [record.id] })

    const userResult = await db.execute({ sql: 'SELECT id FROM users WHERE phone = ?', args: [phone] })
    let user = userResult.rows[0] as unknown as { id: string } | undefined

    if (!user) {
      const userId = crypto.randomUUID()
      await db.execute({
        sql: "INSERT INTO users (id, phone, last_login_at) VALUES (?, ?, datetime('now'))",
        args: [userId, phone],
      })
      user = { id: userId }
    } else {
      await db.execute({ sql: "UPDATE users SET last_login_at = datetime('now') WHERE id = ?", args: [user.id] })
    }

    const licResult = await db.execute({
      sql: `SELECT tier FROM licenses WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
            ORDER BY expires_at DESC LIMIT 1`,
      args: [user.id],
    })
    const license = licResult.rows[0] as unknown as { tier: string } | undefined

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
