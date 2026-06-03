/**
 * ThinkingIndicator — modern sci-fi animation shown while the AI processes.
 * Appears when streaming starts but before the first text chunk arrives.
 * Theme: neural network / agent cluster processing visualization.
 */

import { useI18n } from '../../i18n'

export function ThinkingIndicator() {
  const { t } = useI18n()

  return (
    <div className="flex gap-3 mb-4">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0 relative z-10">
        <span className="text-white text-sm">🤖</span>
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-30" />
      </div>

      {/* Content */}
      <div className="bg-hover rounded-2xl px-4 py-3 min-w-[200px]">
        {/* Agent cluster visualization */}
        <div className="flex flex-col gap-2.5">
          {/* Neural grid */}
          <div className="relative w-full h-8">
            {/* Center core */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_12px_rgba(99,102,241,0.6)] animate-pulse" />
            </div>

            {/* Orbiting nodes */}
            {[0, 60, 120, 180, 240, 300].map((angle, i) => (
              <div
                key={i}
                className="absolute w-1.5 h-1.5 rounded-full bg-primary/80"
                style={{
                  left: `calc(50% + ${Math.cos((angle * Math.PI) / 180) * 14}px)`,
                  top: `calc(50% + ${Math.sin((angle * Math.PI) / 180) * 9}px)`,
                  animation: `node-blink 2s ${i * 0.3}s infinite`,
                  boxShadow: `0 0 6px rgba(99,102,241,0.5)`,
                }}
              />
            ))}

            {/* Connection lines — subtle */}
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ opacity: 0.2 }}
            >
              <line x1="50%" y1="50%" x2="15%" y2="25%" stroke="#6366f1" strokeWidth="0.5" />
              <line x1="50%" y1="50%" x2="85%" y2="25%" stroke="#6366f1" strokeWidth="0.5" />
              <line x1="50%" y1="50%" x2="15%" y2="75%" stroke="#6366f1" strokeWidth="0.5" />
              <line x1="50%" y1="50%" x2="85%" y2="75%" stroke="#6366f1" strokeWidth="0.5" />
            </svg>
          </div>

          {/* Status text */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-primary animate-pulse" />
              <span className="w-1 h-1 rounded-full bg-primary/60 animate-pulse"
                style={{ animationDelay: '0.2s' }}
              />
              <span className="w-1 h-1 rounded-full bg-primary/30 animate-pulse"
                style={{ animationDelay: '0.4s' }}
              />
            </div>
            <span className="text-xs text-text-muted animate-pulse">
              {t('chat.thinking')}
            </span>
          </div>

          {/* Agent pipeline — simplified */}
          <div className="flex items-center gap-1.5 overflow-hidden">
            {['🔍', '🧠', '⚡', '👁', '✅'].map((icon, i) => (
              <div
                key={i}
                className="flex-shrink-0 flex flex-col items-center gap-0.5 opacity-50"
                style={{
                  animation: `agent-slide 3s ${i * 0.4}s infinite`,
                  transform: 'translateX(-20px)',
                }}
              >
                <span
                  className="w-5 h-5 rounded-md bg-surface border border-hover flex items-center justify-center text-[10px]"
                  style={{
                    boxShadow: '0 0 4px rgba(99,102,241,0.15)',
                  }}
                >
                  {icon}
                </span>
                <span className="text-[8px] text-text-muted">
                  {['Research', 'Memory', 'Code', 'Review', 'Verify'][i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

/**
 * Compact thinking indicator — used when partial text has arrived but still streaming.
 */
export function StreamingDot() {
  return (
    <span className="inline-flex items-center ml-1">
      <span
        className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce"
        style={{ animationDuration: '0.8s', animationDelay: '0s' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce"
        style={{ animationDuration: '0.8s', animationDelay: '0.15s' }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce"
        style={{ animationDuration: '0.8s', animationDelay: '0.3s' }}
      />
    </span>
  )
}
