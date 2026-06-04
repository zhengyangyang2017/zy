import { useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useSessionStore } from '../../stores/sessionStore'

function estimateTokens(text: string): number {
  if (!text) return 0
  // Rough: 3 chars ≈ 1 token for CJK, 4 chars ≈ 1 token for ASCII
  const cjkChars = (text.match(/[一-鿿㐀-䶿]/g) || []).length
  const otherChars = text.length - cjkChars
  return Math.ceil(cjkChars / 3 + otherChars / 4)
}

const MAX_TOKENS = 128000

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function TokenUsagePopover({ isOpen, onClose }: Props) {
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const messages = useChatStore((s) => activeSessionId ? (s.messagesBySession[activeSessionId] ?? []) : [])

  const stats = useMemo(() => {
    let systemTokens = 0, userTokens = 0, assistantTokens = 0
    for (const m of messages) {
      const t = estimateTokens(m.content)
      if (m.role === 'system') systemTokens += t
      else if (m.role === 'user') userTokens += t
      else assistantTokens += t
    }
    const total = systemTokens + userTokens + assistantTokens
    const remaining = MAX_TOKENS - total
    const pct = Math.round((total / MAX_TOKENS) * 100)
    return { systemTokens, userTokens, assistantTokens, total, remaining, pct }
  }, [messages])

  if (!isOpen) return null

  return (
    <div className="absolute bottom-8 right-0 z-50 bg-elevated border border-hover rounded-xl shadow-2xl p-4 min-w-[280px]"
      onMouseLeave={onClose}>
      <h3 className="text-xs font-semibold text-text-primary mb-3">上下文使用情况</h3>
      <div className="space-y-1.5 text-[11px]">
        <div className="flex justify-between"><span className="text-text-muted">📥 系统提示</span><span className="text-text-secondary">{stats.systemTokens.toLocaleString()} tokens</span></div>
        <div className="flex justify-between"><span className="text-text-muted">📤 用户消息</span><span className="text-text-secondary">{stats.userTokens.toLocaleString()} tokens</span></div>
        <div className="flex justify-between"><span className="text-text-muted">🤖 AI 回复</span><span className="text-text-secondary">{stats.assistantTokens.toLocaleString()} tokens</span></div>
        <div className="border-t border-hover my-1.5" />
        <div className="flex justify-between font-medium"><span className="text-text-muted">已用</span><span className="text-text-primary">{stats.total.toLocaleString()} tokens</span></div>
        <div className="flex justify-between"><span className="text-text-muted">剩余</span><span className={stats.remaining < 20000 ? 'text-red-400' : 'text-green-400'}>{stats.remaining.toLocaleString()} tokens ({100 - stats.pct}%)</span></div>
        <div className="flex justify-between"><span className="text-text-muted">上限</span><span className="text-text-secondary">{MAX_TOKENS.toLocaleString()} tokens</span></div>
      </div>
      {stats.pct > 85 && (
        <p className="text-[10px] text-yellow-400 mt-2">⚠️ 接近上限，建议开启新会话</p>
      )}
    </div>
  )
}

export function getTokenColor(pct: number): string {
  if (pct > 85) return 'bg-red-500'
  if (pct > 60) return 'bg-yellow-500'
  return 'bg-green-500'
}

export { estimateTokens, MAX_TOKENS }
