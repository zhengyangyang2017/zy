import { useState, useEffect, useCallback } from 'react'

interface AgentInfo {
  id: string
  status: string
  currentTask: string | null
  tasksCompleted: number
  tasksFailed: number
  avgTaskMs: number
  lastHeartbeat: number
  uptime: number
  role: string
}

interface QueueStats {
  totalPending: number
  totalRunning: number
  totalCompleted: number
  totalFailed: number
  avgWaitMs: number
  stealCount: number
  byPriority: { high: number; medium: number; low: number }
}

interface ClusterState {
  agents: AgentInfo[]
  queueStats: QueueStats
  uptime: number
  avgThroughput: number
}

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-text-muted',
  working: 'bg-success',
  error: 'bg-error',
  restarting: 'bg-warning',
  dead: 'bg-red-700',
}

const ROLE_ICONS: Record<string, string> = {
  research: '🔍',
  'code-gen': '⚡',
  'code-review': '👁',
  memory: '🧠',
  evolution: '🔄',
  verify: '✅',
  monitor: '📡',
  general: '🤖',
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function ClusterPanel() {
  const [state, setState] = useState<ClusterState | null>(null)
  const [goal, setGoal] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await window.api.getClusterState()
      setState(data as ClusterState)
    } catch (err) {
      console.error('[ClusterPanel] Failed to get cluster state:', err)
    }
  }, [])

  // Event-driven updates + slow polling fallback
  useEffect(() => {
    refresh()
    const cleanup = window.api.onClusterEvent((_data) => {
      refresh()
    })
    const timer = setInterval(refresh, 15000)
    return () => { cleanup(); clearInterval(timer) }
  }, [refresh])

  async function submitGoal() {
    if (!goal.trim() || submitting) return
    setSubmitting(true)
    try {
      await window.api.submitClusterGoal(goal)
      setGoal('')
    } catch (err) {
      console.error('Failed to submit goal:', err)
    }
    setSubmitting(false)
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-xs">
        连接集群中...
      </div>
    )
  }

  const { agents, queueStats } = state
  const working = agents.filter(a => a.status === 'working').length
  const idle = agents.filter(a => a.status === 'idle').length
  const errorAgents = agents.filter(a => a.status === 'error' || a.status === 'dead').length

  return (
    <div className="flex flex-col h-full bg-surface text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-hover">
        <span className="text-text-muted flex items-center gap-1">
          🖧 Agent 集群
          <span className="text-[10px] text-text-muted/50">— {agents.length} agents</span>
        </span>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-success">{working} 工作</span>
          <span className="text-text-muted">{idle} 空闲</span>
          {errorAgents > 0 && <span className="text-error">{errorAgents} 异常</span>}
        </div>
      </div>

      {/* Queue bar */}
      <div className="flex items-center gap-3 px-3 py-1 border-b border-hover/50 text-[10px] text-text-muted">
        <span>队列: <span className="text-text-primary">{queueStats.totalPending}</span> 待处理</span>
        <span><span className="text-text-primary">{queueStats.totalRunning}</span> 运行中</span>
        <span><span className="text-text-primary">{queueStats.totalCompleted}</span> 已完成</span>
        <span>等待 {formatMs(queueStats.avgWaitMs)}</span>
        <span>窃取 {queueStats.stealCount}</span>
        <span>吞吐 {state.avgThroughput}/min</span>
      </div>

      {/* Agent grid */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-5 gap-1">
          {agents.map((agent) => {
            const isSelected = selectedAgent === agent.id
            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
                className={`
                  flex flex-col items-center gap-0.5 p-1.5 rounded border text-[10px] transition-colors
                  ${isSelected ? 'border-primary bg-primary/10' : 'border-hover bg-surface hover:border-text-muted/30'}
                `}
              >
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[agent.status] || 'bg-text-muted'}`} />
                  <span className="text-text-primary font-mono">{agent.id.replace('agent_', 'A')}</span>
                </div>
                <span className="text-text-muted">{ROLE_ICONS[agent.role] || '🤖'} {agent.role}</span>
                {agent.status === 'working' && (
                  <span className="text-warning text-[9px] truncate max-w-full" title={agent.currentTask || ''}>
                    {agent.currentTask?.slice(0, 12) || '...'}
                  </span>
                )}
                <span className="text-text-muted/50 text-[9px]">
                  {agent.tasksCompleted}c / {agent.tasksFailed}f
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected agent detail */}
      {selectedAgent && (() => {
        const agent = agents.find(a => a.id === selectedAgent)
        if (!agent) return null
        return (
          <div className="border-t border-hover p-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-text-primary font-semibold">{agent.id}</span>
              <span className="text-text-muted">{formatUptime(agent.uptime)}</span>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px]">
              <span className="text-text-muted">状态</span>
              <span className="text-text-primary col-span-2">{agent.status}</span>
              <span className="text-text-muted">角色</span>
              <span className="text-text-primary col-span-2">{ROLE_ICONS[agent.role]} {agent.role}</span>
              <span className="text-text-muted">任务完成</span>
              <span className="text-text-primary col-span-2">{agent.tasksCompleted}</span>
              <span className="text-text-muted">任务失败</span>
              <span className="text-text-primary col-span-2">{agent.tasksFailed}</span>
              <span className="text-text-muted">平均耗时</span>
              <span className="text-text-primary col-span-2">{formatMs(agent.avgTaskMs)}</span>
              {agent.currentTask && (
                <>
                  <span className="text-text-muted">当前任务</span>
                  <span className="text-text-primary col-span-2 truncate font-mono">{agent.currentTask}</span>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Goal input */}
      <div className="flex items-center gap-1 px-2 py-1 border-t border-hover">
        <span className="text-xs flex-shrink-0">🎯</span>
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submitGoal()
            }
          }}
          placeholder="提交目标给集群..."
          className="flex-1 bg-transparent text-xs text-text-primary placeholder-text-muted outline-none"
          disabled={submitting}
          spellCheck={false}
          autoComplete="off"
        />
        {submitting && <span className="text-warning text-[10px]">分解中...</span>}
      </div>
    </div>
  )
}
