export function BottomPanel() {
  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="flex items-center px-3 py-1 border-b border-hover">
        <span className="text-xs text-text-muted">📜 终端</span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-text-muted">终端 (Phase 3)</p>
      </div>
    </div>
  )
}
