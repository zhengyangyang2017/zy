import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { initSchema } from '@/lib/db'
import { signAccessToken, signRefreshToken } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json()

    if (!phone || !code) {
      return NextResponse.json({ error: '手机号和验证码不能为空' }, { status: 400 })
    }

    await initSchema()

    // Rate limit: max 10 verification attempts per phone per 15 minutes
    const verifyResult = await sql`SELECT COUNT(*) as count FROM sms_codes
            WHERE phone = ${phone} AND created_at > NOW() - INTERVAL '15 minutes'`
    const verifyAttempts = verifyResult.rows[0] as { count: number }

    if (verifyAttempts.count > 10) {
      return NextResponse.json({ error: '验证尝试过于频繁，请15分钟后再试' }, { status: 429 })
    }

    const codeResult = await sql`SELECT id FROM sms_codes
            WHERE phone = ${phone} AND code = ${code} AND used = 0 AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1`
    const record = codeResult.rows[0] as { id: string } | undefined

    if (!record) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 401 })
    }

    await sql`UPDATE sms_codes SET used = 1 WHERE id = ${record.id}`

    const userResult = await sql`SELECT id FROM users WHERE phone = ${phone}`
    let user = userResult.rows[0] as { id: string } | undefined

    if (!user) {
      const userId = crypto.randomUUID()
      await sql`INSERT INTO users (id, phone, last_login_at) VALUES (${userId}, ${phone}, NOW())`
      user = { id: userId }
    } else {
      await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`
    }

    const licResult = await sql`SELECT tier FROM licenses WHERE user_id = ${user.id} AND status = 'active' AND expires_at > NOW()
            ORDER BY expires_at DESC LIMIT 1`
    const license = licResult.rows[0] as { tier: string } | undefined

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
