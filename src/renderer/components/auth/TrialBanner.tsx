import { useEffect, useState } from 'react'
import type { LicenseStatus } from '../../../types/license'

export function TrialBanner() {
  const [status, setStatus] = useState<LicenseStatus | null>(null)

  useEffect(() => {
    window.api.getLicenseStatus().then(setStatus).catch(() => {})
  }, [])

  if (!status || !status.trial || !status.daysRemaining) return null

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-b border-purple-500/30">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-purple-400">🎉</span>
        <span className="text-white">
          Pro 试用还剩 <strong className="text-purple-300">{status.daysRemaining}</strong> 天
        </span>
      </div>
      <a
        href="https://your-app.vercel.app/#pricing"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3 py-1 rounded-md transition-colors"
      >
        订阅仅需 ¥15/月
      </a>
    </div>
  )
}
