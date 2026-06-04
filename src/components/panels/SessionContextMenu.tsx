import { useEffect, useRef } from 'react'

interface MenuItem {
  label: string
  icon: string
  action: () => void
  danger?: boolean
  separator?: boolean
}

interface Props {
  items: MenuItem[]
  x: number
  y: number
  onClose: () => void
}

export function SessionContextMenu({ items, x, y, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-elevated border border-hover rounded-lg shadow-2xl py-1 min-w-[160px] animate-fadeIn"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator ? (
            <div className="border-t border-hover my-1" />
          ) : (
            <button
              onClick={() => { item.action(); onClose() }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                item.danger
                  ? 'text-red-400 hover:bg-red-400/10'
                  : 'text-text-secondary hover:bg-hover hover:text-text-primary'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
