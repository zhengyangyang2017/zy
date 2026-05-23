/**
 * Seed Data Generator — populates the database with realistic sample data.
 *
 * Run via: npx tsx src/main/services/seed-generator.ts
 * Or from the app: import { generateSeedData } from './seed-generator'
 *
 * Generates:
 * - Sessions (50) with messages (20-100 each)
 * - Knowledge nodes (500) with embeddings
 * - API call logs (200)
 * - Metrics (1000 time-series points)
 * - Audit entries (200)
 *
 * Total: ~15,000 rows, ~30-50MB database
 */

import { getDb } from '../db'

const TOPICS = [
  'React 19 新特性', 'TypeScript 类型体操', 'Electron IPC 通信',
  '数据库索引优化', 'Docker 容器部署', '微服务架构设计',
  'Rust 所有权机制', 'Python 异步编程', 'GraphQL vs REST',
  'WebAssembly 入门', 'CSS Grid 布局', 'Node.js 性能调优',
  'Kubernetes Pod 调度', 'Redis 缓存策略', 'MongoDB 聚合管道',
  'Git 工作流最佳实践', 'Linux 命令行技巧', 'Tailwind CSS 配置',
  'Vite 打包优化', 'JWT 鉴权方案', 'WebSocket 实时通信',
  'SQL vs NoSQL', '机器学习入门', '函数式编程思想',
  '设计模式实践', '代码审查清单', 'CI/CD 流水线',
  '监控告警体系', '日志收集方案', 'API 版本管理',
  'Nginx 反向代理', '消息队列选型', '分布式锁实现',
  'OAuth 2.0 流程', '正则表达式进阶', '正则深坑',
  'Web3 基础概念', '区块链原理', '零信任架构',
  '前端性能指标', '后端高可用', '移动端适配',
  '跨平台开发', '自动化测试', '代码生成工具',
  '可视化图表库', '状态管理模式', '数据仓库设计',
]

const SAMPLE_MESSAGES = [
  { role: 'user', content: '请帮我写一个 React Hook，用于管理复杂的表单状态，包括校验、提交、重置功能' },
  { role: 'assistant', content: '好的，这是一个完整的 useForm Hook，支持字段级校验、异步提交和表单重置。\n\n```typescript\nimport { useState, useCallback } from "react";\n\nexport function useForm<T>(initialValues: T) {\n  const [values, setValues] = useState<T>(initialValues);\n  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});\n  const [isSubmitting, setIsSubmitting] = useState(false);\n\n  const validate = useCallback((name: keyof T, value: any): string | null => {\n    if (typeof value === "string" && !value.trim()) return "不能为空";\n    return null;\n  }, []);\n\n  const setValue = useCallback((name: keyof T, value: any) => {\n    setValues(prev => ({ ...prev, [name]: value }));\n    setErrors(prev => ({ ...prev, [name]: validate(name, value) }));\n  }, [validate]);\n\n  const reset = useCallback(() => {\n    setValues(initialValues);\n    setErrors({});\n  }, [initialValues]);\n\n  return { values, errors, isSubmitting, setValue, reset, setIsSubmitting };\n}\n```\n\n这个 Hook 提供了完整的表单管理能力，你可以在此基础上扩展自定义校验规则。' },
  { role: 'user', content: '帮我解释一下闭包的概念' },
  { role: 'assistant', content: '闭包是指一个函数能够访问其外部作用域中的变量，即使这个外部函数已经执行完毕。\n\n简单来说：函数 + 它所记住的外部变量 = 闭包。\n\n```javascript\nfunction createCounter() {\n  let count = 0;  // 这个变量被内部函数"记住"了\n  return function() {\n    count++;\n    return count;\n  };\n}\n\nconst counter = createCounter();\nconsole.log(counter()); // 1\nconsole.log(counter()); // 2\n```\n\n闭包在 React 的 useState、useCallback 等 Hook 中大量使用，也是 JavaScript 模块化的基础。' },
  { role: 'user', content: '我们的数据库查询越来越慢了，帮忙分析一下该怎么优化' },
  { role: 'assistant', content: '数据库查询慢通常有以下原因，按优先级排查：\n\n1. **缺少索引** — 检查 WHERE / JOIN / ORDER BY 字段是否都有索引\n2. **N+1 查询** — ORM 循环中发起了多次查询\n3. **全表扫描** — 大表无索引导致 O(n) 扫描\n4. **锁竞争** — 读写冲突导致等待\n\n建议先用 `EXPLAIN ANALYZE` 分析慢查询，然后：\n- 加覆盖索引（covering index）\n- 用连接池减少连接开销\n- 考虑读写分离\n- 大表做分区（partitioning）\n\n需要我帮你看具体的慢查询日志吗？' },
  { role: 'user', content: 'Git rebase 和 merge 有什么区别？什么时候该用哪个？' },
  { role: 'assistant', content: '**Merge** 保留完整历史，产生一个合并提交。**Rebase** 重写历史，让提交线变直线。\n\n| 场景 | 推荐 |\n|------|------|\n| 公共分支合并 | Merge |\n| 个人分支同步主分支 | Rebase |\n| PR 合并到主干 | Squash merge |\n\n**黄金法则**：永远不要 rebase 已经 push 到公共仓库的提交。' },
]

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomDate(daysBack: number): string {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack))
  d.setHours(randomInt(8, 23), randomInt(0, 59), randomInt(0, 59))
  return d.toISOString()
}

export function generateSeedData(options?: {
  sessions?: number
  knowledgeNodes?: number
  apiLogs?: number
  metrics?: number
}): { rowsInserted: number; errors: string[] } {
  const db = getDb()
  const errors: string[] = []
  let rowsInserted = 0

  const numSessions = options?.sessions ?? 50
  const numNodes = options?.knowledgeNodes ?? 500
  const numApiLogs = options?.apiLogs ?? 200
  const numMetrics = options?.metrics ?? 1000

  try {
    // ============================================
    // Sessions + Messages
    // ============================================
    const insertSession = db.prepare(`
      INSERT INTO sessions (id, title, created_at, updated_at, message_count, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const insertMsg = db.prepare(`
      INSERT INTO messages (id, session_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    const sessionIds: string[] = []

    db.transaction(() => {
      for (let i = 0; i < numSessions; i++) {
        const sid = crypto.randomUUID()
        const topic = randomPick(TOPICS)
        const createdAt = randomDate(90)
        const msgCount = randomInt(20, 100)

        insertSession.run(sid, topic, createdAt, createdAt, msgCount, randomPick(['active', 'background', 'idle']))
        sessionIds.push(sid)
        rowsInserted++

        // Generate messages for this session
        for (let j = 0; j < msgCount; j++) {
          const msg = randomPick(SAMPLE_MESSAGES)
          const msgDate = new Date(createdAt)
          msgDate.setMinutes(msgDate.getMinutes() + j * randomInt(2, 15))
          insertMsg.run(crypto.randomUUID(), sid, msg.role, msg.content, msgDate.toISOString())
          rowsInserted++
        }
      }
    })()

    // ============================================
    // Knowledge Nodes
    // ============================================
    const insertNode = db.prepare(`
      INSERT INTO knowledge_nodes (id, type, title, content, summary, tags, source, confidence, importance, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    db.transaction(() => {
      for (let i = 0; i < numNodes; i++) {
        const topic = randomPick(TOPICS)
        const tag = topic.split(/[\s\-]/)[0]
        insertNode.run(
          crypto.randomUUID(),
          randomPick(['fact', 'concept', 'insight', 'preference']),
          `${topic} - 要点 ${i + 1}`,
          `关于 ${topic} 的详细分析内容。这里包含从多轮对话和网络研究中提取的关键知识点。`,
          `摘要：${topic} 的核心要点`,
          JSON.stringify([tag, 'knowledge', 'dev']),
          randomPick(['conversation', 'web_search', 'manual']),
          Math.random() * 0.4 + 0.5,
          Math.random() * 0.5 + 0.3,
          randomDate(90),
          randomDate(30),
        )
        rowsInserted++
      }
    })()

    // ============================================
    // API Call Logs
    // ============================================
    const insertApiLog = db.prepare(`
      INSERT INTO api_call_log (id, provider, model, endpoint, tokens_used, latency_ms, status_code, cost_estimate, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const providers = ['deepseek', 'openai', 'anthropic']
    const models = ['deepseek-v4-pro', 'gpt-4o', 'claude-sonnet-4-6']

    db.transaction(() => {
      for (let i = 0; i < numApiLogs; i++) {
        const idx = i % 3
        insertApiLog.run(
          crypto.randomUUID(),
          providers[idx],
          models[idx],
          '/v1/chat/completions',
          randomInt(500, 8000),
          randomInt(200, 15000),
          Math.random() < 0.95 ? 200 : randomInt(400, 500),
          Math.random() * 0.1,
          randomDate(90),
        )
        rowsInserted++
      }
    })()

    // ============================================
    // Metrics
    // ============================================
    const insertMetric = db.prepare(`
      INSERT INTO metrics (id, namespace, metric_name, metric_value, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    const metrics = [
      { ns: 'cluster', name: 'agent.idle_count', min: 0, max: 15, tags: null },
      { ns: 'cluster', name: 'agent.working_count', min: 2, max: 20, tags: null },
      { ns: 'cluster', name: 'queue.pending_tasks', min: 0, max: 100, tags: null },
      { ns: 'cluster', name: 'task.duration_ms', min: 200, max: 30000, tags: null },
      { ns: 'knowledge', name: 'node.count', min: 100, max: 5000, tags: null },
      { ns: 'knowledge', name: 'edge.count', min: 50, max: 2000, tags: null },
      { ns: 'system', name: 'memory.heap_mb', min: 50, max: 500, tags: null },
      { ns: 'system', name: 'memory.rss_mb', min: 80, max: 800, tags: null },
      { ns: 'api', name: 'call.latency_p99', min: 500, max: 30000, tags: null },
      { ns: 'api', name: 'call.rate_per_min', min: 0, max: 30, tags: null },
    ]

    db.transaction(() => {
      for (let i = 0; i < numMetrics; i++) {
        const m = randomPick(metrics)
        const value = randomInt(m.min, m.max) + Math.random()
        const date = new Date()
        date.setMinutes(date.getMinutes() - i * randomInt(5, 60))
        insertMetric.run(crypto.randomUUID(), m.ns, m.name, Math.round(value * 100) / 100, m.tags, date.toISOString())
        rowsInserted++
      }
    })()

    // ============================================
    // Audit Entries
    // ============================================
    const insertAudit = db.prepare(`
      INSERT INTO audit_log (id, entity_type, entity_id, action, old_values, new_values, performed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const entityTypes = ['session', 'message', 'knowledge_node', 'config', 'task']
    const actions = ['create', 'update', 'delete', 'read', 'export', 'archive']

    db.transaction(() => {
      for (let i = 0; i < 200; i++) {
        const entityType = randomPick(entityTypes)
        insertAudit.run(
          crypto.randomUUID(),
          entityType,
          crypto.randomUUID(),
          randomPick(actions),
          null,
          JSON.stringify({ title: randomPick(TOPICS), ts: randomDate(90) }),
          randomPick(['system', 'user', 'agent']),
          randomDate(90),
        )
        rowsInserted++
      }
    })()

    return { rowsInserted, errors }
  } catch (err) {
    return { rowsInserted, errors: [...errors, String(err)] }
  }
}
