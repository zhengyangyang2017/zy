export function TitleBar() {
  return (
    <div
      className="flex items-center justify-between h-10 bg-surface border-b border-hover px-2"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="flex items-center gap-2 text-xs text-text-muted pl-2">
        <span className="font-semibold text-text-secondary">Claude Code</span>
      </div>

      <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <span className="text-xs text-text-muted mr-3">⌘K</span>
      </div>
    </div>
  )
}
