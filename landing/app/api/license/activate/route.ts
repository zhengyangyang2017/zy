import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { initSchema } from '@/lib/db'
import { signAccessToken, signRefreshToken } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  try {
    const { activation_token } = await req.json()

    if (!activation_token) {
      return NextResponse.json({ error: '缺少激活令牌' }, { status: 400 })
    }

    await initSchema()

    const actResult = await sql`SELECT token, license_id, used FROM activation_tokens
            WHERE token = ${activation_token} AND used = 0 AND expires_at > NOW()`
    const activation = actResult.rows[0] as { token: string; license_id: string; used: number } | undefined

    if (!activation) {
      return NextResponse.json({ error: '激活令牌无效或已过期' }, { status: 401 })
    }

    await sql`UPDATE activation_tokens SET used = 1 WHERE token = ${activation.token}`

    const licResult = await sql`SELECT l.user_id, l.tier FROM licenses l
            WHERE l.id = ${activation.license_id} AND l.status = 'active' AND l.expires_at > NOW()`
    const license = licResult.rows[0] as { user_id: string; tier: string } | undefined

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
