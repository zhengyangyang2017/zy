import { useEffect, useRef, useCallback } from 'react'
import type { PromptTemplate } from '../../types'

const DEFAULT_TEMPLATES: PromptTemplate[] = [
  { id: 'explain', title: '解释代码', prompt: '请用中文详细解释以下代码的工作原理：\n', icon: '💡' },
  { id: 'test', title: '编写测试', prompt: '请为以下代码编写全面的单元测试用例：\n', icon: '🧪' },
  { id: 'doc', title: '生成文档', prompt: '请为以下函数/类生成完整的 JSDoc 文档：\n', icon: '📖' },
  { id: 'security', title: '安全审查', prompt: '请审查以下代码的安全漏洞和潜在风险：\n', icon: '🔒' },
  { id: 'perf', title: '性能分析', prompt: '请分析以下代码的性能瓶颈并给出优化建议：\n', icon: '⚡' },
  { id: 'review', title: '代码审查', prompt: '请对以下代码进行全面审查（可读性、健壮性、最佳实践）：\n', icon: '👁️' },
  { id: 'translate', title: '翻译注释', prompt: '请将以下代码中的注释翻译为中文：\n', icon: '🌐' },
  { id: 'simplify', title: '简化代码', prompt: '请简化以下代码，在不改变功能的前提下减少复杂度：\n', icon: '✨' },
]

interface Props {
  isOpen: boolean
  onSelect: (template: PromptTemplate) => void
  onClose: () => void
}

export function PromptTemplatePicker({ isOpen, onSelect, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef(0)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); selectedRef.current = Math.min(selectedRef.current + 1, DEFAULT_TEMPLATES.length - 1); break
      case 'ArrowUp': e.preventDefault(); selectedRef.current = Math.max(selectedRef.current - 1, 0); break
      case 'Enter': e.preventDefault(); if (DEFAULT_TEMPLATES[selectedRef.current]) onSelect(DEFAULT_TEMPLATES[selectedRef.current]); break
      case 'Escape': e.preventDefault(); onClose(); break
    }
  }, [isOpen, onSelect, onClose])

  useEffect(() => {
    selectedRef.current = 0
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!isOpen) return null

  return (
    <div ref={menuRef} className="absolute z-50 bg-elevated border border-hover rounded-lg shadow-lg overflow-hidden"
      style={{ bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '4px', minWidth: '320px' }}>
      <div className="px-3 py-1.5 border-b border-hover flex items-center justify-between">
        <span className="text-[10px] text-text-muted">提示词模板</span>
        <span className="text-[9px] text-text-muted">Ctrl+Shift+P</span>
      </div>
      <div className="grid grid-cols-2 gap-1 p-1.5">
        {DEFAULT_TEMPLATES.map((tpl, i) => (
          <button key={tpl.id} onClick={() => onSelect(tpl)}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-colors ${i === selectedRef.current ? 'bg-active ring-1 ring-primary/30' : 'hover:bg-hover'}`}>
            <span className="text-sm">{tpl.icon}</span>
            <span className="text-xs text-text-secondary">{tpl.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export { DEFAULT_TEMPLATES }
