import { useState, useCallback } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onLoginSuccess: () => void
}

export function LoginModal({ open, onClose, onLoginSuccess }: Props) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(0)

  const sendCode = useCallback(async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入正确的手机号')
      return
    }
    setSending(true)
    setError('')
    try {
      await window.api.sendSmsCode(phone)
      setCodeSent(true)
      setCountdown(60)
      const timer = setInterval(() => {
        setCountdown((c) => { if (c <= 1) { clearInterval(timer); return 0 }; return c - 1 })
      }, 1000)
    } catch (e: any) {
      setError(e.message || '发送失败')
    } finally {
      setSending(false)
    }
  }, [phone])

  const login = useCallback(async () => {
    if (!code || code.length !== 6) {
      setError('请输入6位验证码')
      return
    }
    setLoading(true)
    setError('')
    try {
      await window.api.loginWithPhone(phone, code)
      onLoginSuccess()
      onClose()
    } catch (e: any) {
      setError(e.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }, [phone, code, onLoginSuccess, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-hover rounded-xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">登录 / 注册</h2>

        <label className="block text-xs text-text-muted mb-1">手机号</label>
        <input
          type="tel"
          maxLength={11}
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setError('') }}
          placeholder="输入手机号"
          className="w-full bg-background border border-hover rounded-md px-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-primary mb-3"
        />

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            maxLength={6}
            value={code}
            onChange={(e) => { setCode(e.target.value); setError('') }}
            placeholder="验证码"
            className="flex-1 bg-background border border-hover rounded-md px-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-primary"
          />
          <button
            onClick={sendCode}
            disabled={sending || countdown > 0 || !phone}
            className="text-xs bg-primary/20 hover:bg-primary/30 text-primary px-3 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {countdown > 0 ? `${countdown}s` : sending ? '发送中...' : '获取验证码'}
          </button>
        </div>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        <button
          onClick={login}
          disabled={loading || !code}
          className="w-full bg-primary hover:bg-primary/90 text-white py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
        >
          {loading ? '登录中...' : '登录 / 注册'}
        </button>

        <button
          onClick={onClose}
          className="w-full mt-2 text-xs text-text-muted hover:text-white py-1 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  )
}
