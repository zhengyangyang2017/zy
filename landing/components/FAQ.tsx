const FAQS = [
  { q: '和 Cursor、Copilot 有什么区别？', a: 'CodeBuddy 是桌面端工具，数据完全本地化，你自带API Key。Cursor/Copilot 是IDE插件，数据走云端。我们的20 Agent集群和知识图谱功能是独有的。' },
  { q: '免费版够用吗？', a: '免费版支持3个Agent并行、AI对话、文件管理、Git和终端。个人日常开发完全够用。Pro版解锁知识图谱和20个Agent集群，适合深度用户。' },
  { q: '我的代码会上传到你们的服务器吗？', a: '不会。所有数据存储在本地SQLite数据库，API调用直接从你的设备到你选择的AI服务商。我们不代理、不存储、不上传。' },
  { q: '支持哪些模型？', a: '支持Anthropic Claude、OpenAI GPT、DeepSeek，以及任何OpenAI兼容API。你可以随时切换。' },
  { q: '如何订阅 Pro？', a: '在App内点击订阅，或在网站上购买。支持微信支付和支付宝。付款后自动激活，无需手动输入License Key。' },
]

export function FAQ() {
  return (
    <section id="faq" className="px-6 py-20 max-w-3xl mx-auto">
      <h2 className="text-3xl font-bold text-white text-center mb-12">常见问题</h2>
      <div className="space-y-4">
        {FAQS.map((faq) => (
          <details key={faq.q} className="bg-white/5 border border-gray-700/50 rounded-xl p-4 group">
            <summary className="text-white font-medium cursor-pointer list-none flex justify-between items-center">
              {faq.q}
              <span className="text-gray-500 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <p className="text-sm text-gray-400 mt-3 leading-relaxed">{faq.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
