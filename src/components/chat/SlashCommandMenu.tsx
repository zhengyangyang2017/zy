import { useEffect, useRef, useCallback } from 'react'

interface Command {
  command: string
  label: string
  description: string
  promptPrefix: string
}

const COMMANDS: Command[] = [
  { command: '/explain', label: '解释代码', description: '解释选中代码的工作原理', promptPrefix: '请解释以下代码：\n' },
  { command: '/fix', label: '修复 Bug', description: '分析和修复代码中的 bug', promptPrefix: '请分析并修复以下代码中的 bug：\n' },
  { command: '/refactor', label: '重构代码', description: '提高代码可读性和可维护性', promptPrefix: '请重构以下代码，提高可读性和可维护性：\n' },
  { command: '/test', label: '生成测试', description: '为代码编写单元测试', promptPrefix: '请为以下代码编写全面的单元测试：\n' },
  { command: '/doc', label: '生成文档', description: '生成 JSDoc 或 API 文档', promptPrefix: '请为以下代码生成完整的文档：\n' },
  { command: '/review', label: '代码审查', description: '审查代码质量、安全性和性能', promptPrefix: '请审查以下代码的质量、安全性和性能：\n' },
  { command: '/optimize', label: '性能优化', description: '分析和优化代码性能', promptPrefix: '请分析以下代码的性能瓶颈并进行优化：\n' },
]

interface Props {
  isOpen: boolean
  query: string
  onSelect: (command: Command) => void
  onClose: () => void
}

export function SlashCommandMenu({ isOpen, query, onSelect, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<number>(0)

  const filtered = COMMANDS.filter(
    (c) => c.command.includes(query.toLowerCase()) || c.label.includes(query)
  )

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        selectedRef.current = Math.min(selectedRef.current + 1, filtered.length - 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        selectedRef.current = Math.max(selectedRef.current - 1, 0)
        break
      case 'Enter':
        e.preventDefault()
        if (filtered[selectedRef.current]) onSelect(filtered[selectedRef.current])
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [isOpen, filtered, onSelect, onClose])

  useEffect(() => {
    selectedRef.current = 0
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen || filtered.length === 0) return null

  return (
    <div ref={menuRef} className="absolute z-50 bg-elevated border border-hover rounded-lg shadow-lg overflow-hidden"
      style={{ bottom: '100%', left: 0, marginBottom: '4px', minWidth: '280px' }}>
      <div className="px-3 py-1.5 border-b border-hover">
        <span className="text-[10px] text-text-muted">命令</span>
      </div>
      {filtered.map((cmd, i) => (
        <button key={cmd.command} onClick={() => onSelect(cmd)}
          className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${i === selectedRef.current ? 'bg-active' : 'hover:bg-hover'}`}>
          <span className="text-xs font-mono text-primary whitespace-nowrap">{cmd.command}</span>
          <span className="text-xs text-text-secondary">{cmd.label}</span>
          <span className="text-[10px] text-text-muted ml-auto">{cmd.description}</span>
        </button>
      ))}
    </div>
  )
}

export { COMMANDS }
export type { Command }
