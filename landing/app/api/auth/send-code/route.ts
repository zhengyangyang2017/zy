import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const RATE_LIMIT_MAX = 3

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json()

    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 })
    }

    const db = getDb()

    const recentCount = db.prepare(`
      SELECT COUNT(*) as count FROM sms_codes
      WHERE phone = ? AND created_at > datetime('now', '-1 hour')
    `).get(phone) as { count: number }

    if (recentCount.count >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: '发送过于频繁，请1小时后再试' }, { status: 429 })
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const id = crypto.randomUUID()

    db.prepare(`
      INSERT INTO sms_codes (id, phone, code, expires_at)
      VALUES (?, ?, ?, datetime('now', '+15 minutes'))
    `).run(id, phone, code)

    // Dev only: log code to console (replace with real SMS provider in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[SMS] Code for ${phone}: ${code}`)
    }

    return NextResponse.json({ success: true, message: '验证码已发送' })
  } catch (err) {
    console.error('[send-code]', err)
    return NextResponse.json({ error: '发送失败，请稍后重试' }, { status: 500 })
  }
}
