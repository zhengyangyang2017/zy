import { useEffect, useState, useCallback } from 'react'
import { useClusterStore } from '../../stores/clusterStore'

const STATUS_COLORS: Record<string, string> = {
  working: 'bg-green-500',
  idle: 'bg-gray-500',
  error: 'bg-red-500',
  dead: 'bg-red-900',
  restarting: 'bg-yellow-500',
}

interface Props {
  onClose: () => void
}

export function ClusterDashboard({ onClose }: Props) {
  const { data, setData } = useClusterStore()

  const poll = useCallback(async () => {
    try {
      const [state, agents, queue] = await Promise.all([
        window.api.getClusterState(),
        window.api.getClusterAgents(),
        window.api.getClusterQueue(),
      ])
      setData({
        agents: agents || [],
        queueLength: queue?.pending || 0,
        totalCompleted: state?.tasksCompleted || 0,
        totalFailed: state?.tasksFailed || 0,
        isRunning: state?.isRunning || false,
      })
    } catch { /* cluster may not be initialized */ }
  }, [setData])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [poll])

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-surface rounded-2xl shadow-2xl border border-hover p-6 w-[640px] h-[480px] flex items-center justify-center">
          <p className="text-text-muted text-sm">集群未启动</p>
        </div>
      </div>
    )
  }

  const workingCount = data.agents.filter(a => a.status === 'working').length
  const idleCount = data.agents.filter(a => a.status === 'idle').length
  const errorCount = data.agents.filter(a => a.status === 'error' || a.status === 'dead').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-2xl border border-hover overflow-hidden w-[640px] h-[480px] flex flex-col animate-scaleIn">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hover">
          <h3 className="text-sm font-semibold text-text-primary">🤖 Agent 集群仪表盘</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <h4 className="text-[10px] text-text-muted uppercase mb-2">📊 总览</h4>
            <div className="flex gap-2">
              <div className="flex-1 bg-elevated rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-green-400">{workingCount}</p>
                <p className="text-[10px] text-text-muted">工作中</p>
              </div>
              <div className="flex-1 bg-elevated rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-text-secondary">{idleCount}</p>
                <p className="text-[10px] text-text-muted">空闲</p>
              </div>
              <div className="flex-1 bg-elevated rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-red-400">{errorCount}</p>
                <p className="text-[10px] text-text-muted">异常</p>
              </div>
              <div className="flex-1 bg-elevated rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-primary">{data.queueLength}</p>
                <p className="text-[10px] text-text-muted">排队中</p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] text-text-muted uppercase mb-2">🤖 Agent 列表 ({data.agents.length})</h4>
            <div className="grid grid-cols-4 gap-2">
              {data.agents.map((agent) => (
                <div key={agent.agentId} className="bg-elevated rounded-lg p-2.5 border border-hover">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status] || 'bg-gray-500'}`} />
                    <span className="text-[10px] text-text-secondary truncate">{agent.agentId}</span>
                  </div>
                  <p className="text-[9px] text-text-muted">{agent.role || 'idle'}</p>
                  <div className="flex justify-between mt-1.5 text-[9px]">
                    <span className="text-green-400">{agent.tasksCompleted || 0} done</span>
                    <span className="text-red-400">{agent.tasksFailed || 0} fail</span>
                  </div>
                  {agent.currentTask && (
                    <p className="text-[8px] text-text-muted mt-1 truncate" title={agent.currentTask}>
                      {agent.currentTask.slice(0, 30)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 text-[10px] text-text-muted border-t border-hover pt-3">
            <span>📈 已完成: {data.totalCompleted}</span>
            <span>⏱ 失败: {data.totalFailed}</span>
            <span>{data.isRunning ? '🟢 运行中' : '⏸ 已暂停'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
