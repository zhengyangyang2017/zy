const FEATURES = [
  { icon: '🧠', title: '20 Agent 集群', desc: '代码生成、审查、研究并行处理，复杂任务自动分解为工作流DAG执行' },
  { icon: '📚', title: '知识图谱', desc: '自动从对话中提取知识，向量+关键词混合检索，让AI越用越了解你的项目' },
  { icon: '🔒', title: '数据本地化', desc: '自带API Key，代码不离开你的设备。所有数据存储在本地SQLite，隐私零风险' },
  { icon: '🔄', title: '自进化系统', desc: 'AI分析回答质量，自动调整策略。准确率、完整性、简洁度持续优化' },
  { icon: '💻', title: '内置终端', desc: 'xterm + node-pty真实终端，支持交互式命令，不用离开编辑器' },
  { icon: '🌐', title: '多厂商支持', desc: '支持Anthropic、OpenAI、DeepSeek及任何兼容API，自由选择模型' },
]

export function Features() {
  return (
    <section id="features" className="px-6 py-20 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-white text-center mb-12">核心功能</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {FEATURES.map((f) => (
          <div key={f.title} className="bg-white/5 border border-gray-700/50 rounded-xl p-6 hover:border-gray-600 transition-colors">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
            <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
