import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { initSchema } from '@/lib/db'
import { verifyRefreshToken, signAccessToken } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  try {
    const { refresh_token } = await req.json()

    if (!refresh_token) {
      return NextResponse.json({ error: '缺少 refresh_token' }, { status: 400 })
    }

    let payload
    try {
      payload = verifyRefreshToken(refresh_token)
    } catch {
      return NextResponse.json({ error: 'refresh_token 无效或已过期' }, { status: 401 })
    }

    await initSchema()

    const licResult = await sql`SELECT tier FROM licenses WHERE user_id = ${payload.sub} AND status = 'active' AND expires_at > NOW()
            ORDER BY expires_at DESC LIMIT 1`
    const license = licResult.rows[0] as { tier: string } | undefined

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
