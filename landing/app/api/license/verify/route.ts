import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { initSchema } from '@/lib/db'
import { verifyAccessToken, signAccessToken } from '@/lib/jwt'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      return NextResponse.json({ error: '未提供认证令牌' }, { status: 401 })
    }

    let payload
    try {
      payload = verifyAccessToken(token)
    } catch {
      return NextResponse.json({ valid: false, error: '令牌已过期' }, { status: 401 })
    }

    await initSchema()

    const licResult = await sql`SELECT tier FROM licenses WHERE user_id = ${payload.sub} AND status = 'active' AND expires_at > NOW()
            ORDER BY expires_at DESC LIMIT 1`
    const license = licResult.rows[0] as { tier: string } | undefined

    const effectiveTier = license?.tier || 'free'
    const trial = !license

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
