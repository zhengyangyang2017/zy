import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '../../i18n'
import { InlineSpinner } from '../ui/Spinner'

// ============================================
// Types
// ============================================

interface TaskItem {
  id: string
  topic: string
  question: string | null
  priority: number
  status: string
  depth: number
  max_sources: number
  created_at: string
  completed_at: string | null
}

interface KnowledgeStats {
  nodeCount: number
  edgeCount: number
}

const STATUS_CONFIG: Record<string, { color: string; icon: string }> = {
  pending:    { color: 'text-text-muted', icon: '○' },
  researching:{ color: 'text-primary', icon: '◉' },
  completed:  { color: 'text-success', icon: '●' },
  failed:     { color: 'text-error', icon: '✕' },
}

const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: 'tasks.statusPending',
  researching: 'tasks.statusResearching',
  completed: 'tasks.statusCompleted',
  failed: 'tasks.statusFailed',
}

// ============================================
// Components
// ============================================

function TaskRow({ task }: { task: TaskItem }) {
  const { t } = useI18n()
  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending

  return (
    <div className="px-2 py-1.5 border-b border-hover/50 hover:bg-hover/50 transition-colors">
      <div className="flex items-start gap-1.5">
        <span className={`text-xs mt-0.5 ${config.color}`}>{config.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-primary truncate">{task.topic}</p>
          {task.question && (
            <p className="text-[10px] text-text-muted truncate mt-0.5">{task.question}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] ${config.color}`}>{t(STATUS_LABEL_KEYS[task.status] || STATUS_LABEL_KEYS.pending)}</span>
            <span className="text-[10px] text-text-muted">
              {t('tasks.depth')}:{task.depth} · {t('tasks.sources')}:{task.max_sources}
            </span>
            {task.priority > 0.7 && (
              <span className="text-[10px] text-warning">{t('tasks.highPriority')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Main Panel
// ============================================

export function TasksPanel() {
  const { t } = useI18n()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [stats, setStats] = useState<KnowledgeStats>({ nodeCount: 0, edgeCount: 0 })
  const [newTopic, setNewTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')

  const refresh = useCallback(async () => {
    try {
      const [taskList, knowledgeStats] = await Promise.all([
        window.api.listTasks(),
        window.api.getKnowledgeStats(),
      ])
      setTasks((taskList || []) as TaskItem[])
      setStats((knowledgeStats || { nodeCount: 0, edgeCount: 0 }) as KnowledgeStats)
    } catch { /* panel may not be visible yet */ }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 10000)
    return () => clearInterval(interval)
  }, [refresh])

  async function handleCreate() {
    if (!newTopic.trim() || loading) return
    setLoading(true)
    await window.api.createTask(newTopic.trim(), 0.8)
    setNewTopic('')
    setLoading(false)
    refresh()
  }

  async function handleResearch(topic: string) {
    await window.api.startResearch(topic)
    refresh()
  }

  const filtered = tasks.filter(t => {
    if (filter === 'pending') return t.status === 'pending' || t.status === 'researching'
    if (filter === 'completed') return t.status === 'completed'
    return true
  })

  const pendingCount = tasks.filter(t => t.status === 'pending' || t.status === 'researching').length
  const completedCount = tasks.filter(t => t.status === 'completed').length

  return (
    <div className="flex flex-col h-full">
      {/* Knowledge stats */}
      <div className="flex items-center gap-3 px-2 py-1.5 border-b border-hover text-[10px] text-text-muted">
        <span>{t('tasks.knowledgeStats', { nodes: stats.nodeCount, edges: stats.edgeCount })}</span>
      </div>

      {/* Create task input */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-hover">
        <input
          type="text"
          placeholder={t('tasks.placeholder')}
          value={newTopic}
          onChange={(e) => setNewTopic(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          className="flex-1 bg-hover text-xs text-text-primary placeholder-text-muted rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleCreate}
          disabled={!newTopic.trim() || loading}
          className="text-xs bg-primary text-white rounded px-2 py-1 hover:opacity-90 disabled:opacity-30 transition-opacity"
        >
          {loading ? <InlineSpinner /> : '+'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-hover">
        {(['all', 'pending', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-1 text-[10px] transition-colors ${
              filter === f ? 'text-primary border-b border-primary' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {f === 'all' ? `${t('tasks.all')} (${tasks.length})` : f === 'pending' ? `${t('tasks.inProgress')} (${pendingCount})` : `${t('tasks.done')} (${completedCount})`}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-2xl">📋</p>
            <p className="text-xs text-text-muted">
              {tasks.length === 0 ? t('tasks.empty') : t('tasks.noMatch')}
            </p>
            {tasks.length === 0 && (
              <p className="text-[10px] text-text-muted">
                {t('tasks.autoHint')}
              </p>
            )}
          </div>
        ) : (
          filtered.map((task) => (
            <div key={task.id} onClick={() => task.status === 'pending' && handleResearch(task.topic)} className={task.status === 'pending' ? 'cursor-pointer' : ''}>
              <TaskRow task={task} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
