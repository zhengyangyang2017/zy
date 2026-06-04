import { useI18n } from '../../i18n'
import { usePanelStore } from '../../stores/panelStore'
import { useSessionStore } from '../../stores/sessionStore'
import { useEffect, useState, useMemo } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { TokenUsagePopover, getTokenColor, estimateTokens, MAX_TOKENS } from '../chat/TokenUsagePopover'
import { useClusterStore } from '../../stores/clusterStore'
import type { LicenseStatus } from '../../types/license'

export function StatusBar() {
  const { t } = useI18n()
  const toggleBottomPanel = usePanelStore((s) => s.toggleBottomPanel)
  const bottomPanelOpen = usePanelStore((s) => s.bottomPanelOpen)
  const activeSessionId = useSessionStore((s) => s.activeSessionId)
  const [nodeCount, setNodeCount] = useState(0)
  const [agentCount, setAgentCount] = useState(0)
  const [activeAgents, setActiveAgents] = useState(0)
  const [license, setLicense] = useState<LicenseStatus | null>(null)
  const [gitInfo, setGitInfo] = useState<{ branch: string; changes: number }>({ branch: '', changes: 0 })
  const [connected, setConnected] = useState(false)
  const [tasksCount, setTasksCount] = useState(0)

  // Poll knowledge stats
  useEffect(() => {
    const poll = () => {
      window.api.getKnowledgeStats().then((s: { nodeCount: number }) => {
        setNodeCount(s.nodeCount)
      }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [])

  // Poll agent stats
  useEffect(() => {
    const poll = () => {
      window.api.getClusterAgents().then((agents: Array<{ status: string }>) => {
        if (agents) {
          setAgentCount(agents.length)
          setActiveAgents(agents.filter(a => a.status === 'working').length)
        }
      }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [])

  // Poll git status
  useEffect(() => {
    const poll = () => {
      window.api.gitStatus().then((s: { branch?: string; files?: Array<unknown>; error?: string }) => {
        if (s && !s.error) {
          setGitInfo({ branch: s.branch || '', changes: s.files?.length || 0 })
        }
      }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 15000)
    return () => clearInterval(interval)
  }, [])

  // Poll license status
  useEffect(() => {
    const poll = () => {
      window.api.getLicenseStatus().then(setLicense).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 30000)
    return () => clearInterval(interval)
  }, [])

  // Poll tasks count
  useEffect(() => {
    const poll = () => {
      window.api.getTasksList().then((tasks: Array<unknown>) => {
        setTasksCount(tasks?.length || 0)
      }).catch(() => {})
    }
    poll()
    const interval = setInterval(poll, 15000)
    return () => clearInterval(interval)
  }, [])

  // Connection status
  useEffect(() => {
    setConnected(!!activeSessionId)
  }, [activeSessionId])

  const [tokenPopoverOpen, setTokenPopoverOpen] = useState(false)
  const messages = useChatStore((s) => activeSessionId ? (s.messagesBySession[activeSessionId] ?? []) : [])

  const tokenStats = useMemo(() => {
    let total = 0
    for (const m of messages) total += estimateTokens(m.content)
    return { total, pct: Math.round((total / MAX_TOKENS) * 100) }
  }, [messages])

  return (
    <div className="flex items-center h-7 bg-surface border-t border-hover px-3 text-[10px] gap-2 select-none">
      {/* Connection status */}
      <span className={`flex items-center gap-1 ${connected ? 'text-success' : 'text-text-muted'}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-success' : 'bg-gray-500'}`} />
        {connected ? '已连接' : '就绪'}
      </span>

      <span className="text-text-muted/30">|</span>

      {/* Agent cluster */}
      {agentCount > 0 && (
        <>
          <button
            onClick={() => useClusterStore.getState().toggleDashboard()}
            className="text-text-muted flex items-center gap-1 hover:text-text-secondary hover:bg-hover px-1 py-0.5 rounded transition-colors"
            title="点击打开 Agent 仪表盘"
          >
            🤖 {activeAgents}/{agentCount} agents
          </button>
          <span className="text-text-muted/30">|</span>
        </>
      )}

      {/* Knowledge graph */}
      {nodeCount > 0 && (
        <>
          <span className="text-text-muted flex items-center gap-1">
            🧠 {nodeCount} 知识点
          </span>
          <span className="text-text-muted/30">|</span>
        </>
      )}

      {/* Tasks */}
      {tasksCount > 0 && (
        <>
          <span className="text-text-muted flex items-center gap-1">
            📋 {tasksCount} 任务
          </span>
          <span className="text-text-muted/30">|</span>
        </>
      )}

      {/* Git */}
      {gitInfo.branch && (
        <>
          <span className="text-text-muted flex items-center gap-1">
            🔀 {gitInfo.branch}
            {gitInfo.changes > 0 && (
              <span className="text-yellow-400">·{gitInfo.changes} files</span>
            )}
          </span>
          <span className="text-text-muted/30">|</span>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Token usage bar */}
      {activeSessionId && tokenStats.total > 0 && (
        <>
          <div className="relative flex items-center gap-1.5">
            <button
              onClick={() => setTokenPopoverOpen(!tokenPopoverOpen)}
              className="flex items-center gap-1 hover:bg-hover px-1 py-0.5 rounded transition-colors"
              title="上下文使用情况"
            >
              <div className="w-16 h-1.5 bg-hover rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getTokenColor(tokenStats.pct)}`}
                  style={{ width: `${Math.min(tokenStats.pct, 100)}%` }}
                />
              </div>
              <span className={`text-[9px] ${tokenStats.pct > 85 ? 'text-red-400' : tokenStats.pct > 60 ? 'text-yellow-400' : 'text-text-muted'}`}>
                {Math.round(tokenStats.total / 1000)}K
              </span>
            </button>
            <TokenUsagePopover isOpen={tokenPopoverOpen} onClose={() => setTokenPopoverOpen(false)} />
          </div>
          <span className="text-text-muted/30">|</span>
        </>
      )}

      {/* Terminal toggle */}
      <button
        onClick={toggleBottomPanel}
        title="终端 (Ctrl+`)"
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors ${
          bottomPanelOpen
            ? 'bg-active text-primary'
            : 'text-text-muted hover:text-text-secondary hover:bg-hover'
        }`}
      >
        <span className="text-xs">💻</span>
        <span>终端</span>
      </button>

      <span className="text-text-muted/30">|</span>

      {/* License tier */}
      {license && (
        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
          license.tier === 'pro' || license.tier === 'enterprise'
            ? 'bg-purple-500/20 text-purple-300'
            : 'text-text-muted'
        }`}>
          {license.trial ? '🧪 试用中' : license.tier === 'pro' ? '⭐ Pro' : license.tier === 'enterprise' ? '🏢 企业' : '免费版'}
        </span>
      )}
    </div>
  )
}
