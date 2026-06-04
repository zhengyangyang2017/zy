import { useSessionStore } from '../../stores/sessionStore'
import { useI18n } from '../../i18n'

const QUICK_STARTS = [
  { icon: '🔍', text: '帮我审查这段代码', prompt: '请帮我审查以下代码的质量、安全性和性能：' },
  { icon: '📝', text: '生成 API 文档', prompt: '请为以下代码生成完整的 API 文档：' },
  { icon: '🐛', text: '帮我 Debug 一个 Bug', prompt: '我遇到了一个 bug，请帮我分析和修复：' },
  { icon: '🔄', text: '重构这个函数', prompt: '请重构以下代码，提高可读性和可维护性：' },
  { icon: '🧪', text: '编写单元测试', prompt: '请为以下代码编写全面的单元测试：' },
  { icon: '📖', text: '解释这段代码', prompt: '请详细解释以下代码的工作原理：' },
]

const SHORTCUTS = [
  { keys: 'Ctrl+B', desc: '切换侧边栏' },
  { keys: 'Ctrl+`', desc: '终端' },
  { keys: 'Ctrl+K', desc: '命令面板' },
  { keys: 'Ctrl+,', desc: '设置' },
  { keys: 'Ctrl+Tab', desc: '切换会话' },
]

export function WelcomeScreen() {
  const { t } = useI18n()
  const addSession = useSessionStore((s) => s.addSession)

  async function handleQuickStart(_prompt: string) {
    const session = await window.api.createSession(t('sidebar.newSession'))
    addSession(session)
  }

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 max-w-2xl mx-auto">
      <div className="text-5xl mb-4">🤖</div>
      <h2 className="text-xl font-bold text-text-primary mb-1">Claude Code</h2>
      <p className="text-sm text-text-muted mb-8">多 Agent AI 编程助手</p>

      <div className="grid grid-cols-2 gap-2 w-full mb-10">
        {QUICK_STARTS.map((item) => (
          <button
            key={item.text}
            onClick={() => handleQuickStart(item.prompt)}
            className="flex items-center gap-3 px-4 py-3 bg-surface border border-hover rounded-xl text-left hover:border-primary/40 hover:bg-hover transition-all duration-150 group"
          >
            <span className="text-lg group-hover:scale-110 transition-transform">{item.icon}</span>
            <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">{item.text}</span>
          </button>
        ))}
      </div>

      <div className="w-full">
        <p className="text-[10px] text-text-muted uppercase tracking-wider mb-2 text-center">快捷键</p>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {SHORTCUTS.map((s) => (
            <span key={s.keys} className="text-[10px] text-text-muted">
              <kbd className="px-1 py-0.5 bg-surface border border-hover rounded text-[9px] font-mono">{s.keys}</kbd>
              {' '}{s.desc}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
