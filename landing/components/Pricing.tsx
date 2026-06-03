export function Pricing() {
  return (
    <section id="pricing" className="px-6 py-20 max-w-5xl mx-auto">
      <h2 className="text-3xl font-bold text-white text-center mb-4">简单定价</h2>
      <p className="text-gray-400 text-center mb-12">自带API Key，我们只收工具费</p>
      <div className="grid md:grid-cols-3 gap-6">
        {/* Free */}
        <div className="bg-white/5 border border-gray-700/50 rounded-xl p-8">
          <h3 className="text-xl font-semibold text-white mb-2">免费版</h3>
          <p className="text-3xl font-bold text-white mb-1">¥0</p>
          <p className="text-sm text-gray-500 mb-6">永久免费</p>
          <ul className="space-y-3 mb-8">
            <li className="text-sm text-gray-400">✅ 基础AI对话</li>
            <li className="text-sm text-gray-400">✅ 3 Agent并行</li>
            <li className="text-sm text-gray-400">✅ 文件/终端/Git</li>
            <li className="text-sm text-gray-400">✅ 自带API Key</li>
            <li className="text-sm text-gray-600">❌ 知识图谱</li>
            <li className="text-sm text-gray-600">❌ 自进化系统</li>
          </ul>
          <a href="#download" className="block text-center border border-gray-600 hover:border-gray-400 text-gray-300 py-2 rounded-lg text-sm transition-colors">免费下载</a>
        </div>
        {/* Pro */}
        <div className="bg-gradient-to-b from-purple-600/30 to-blue-600/30 border border-purple-500/50 rounded-xl p-8 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs px-3 py-1 rounded-full">推荐</div>
          <h3 className="text-xl font-semibold text-white mb-2">Pro 版</h3>
          <p className="text-3xl font-bold text-white mb-1">¥15<span className="text-lg font-normal text-gray-400">/月</span></p>
          <p className="text-sm text-gray-500 mb-6">或 ¥129/年 (8折)</p>
          <ul className="space-y-3 mb-8">
            <li className="text-sm text-gray-300">✅ 免费版全部功能</li>
            <li className="text-sm text-gray-300">✅ <strong>20 Agent集群</strong></li>
            <li className="text-sm text-gray-300">✅ <strong>知识图谱</strong></li>
            <li className="text-sm text-gray-300">✅ <strong>自进化系统</strong></li>
            <li className="text-sm text-gray-300">✅ 无限知识库容量</li>
            <li className="text-sm text-gray-300">✅ 7天免费试用</li>
          </ul>
          <a href="/subscribe" className="block text-center bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm font-medium transition-colors">开始试用</a>
        </div>
        {/* Enterprise */}
        <div className="bg-white/5 border border-gray-700/50 rounded-xl p-8">
          <h3 className="text-xl font-semibold text-white mb-2">企业版</h3>
          <p className="text-3xl font-bold text-white mb-1">联系我们</p>
          <p className="text-sm text-gray-500 mb-6">5席位起 · 按年签约</p>
          <ul className="space-y-3 mb-8">
            <li className="text-sm text-gray-400">✅ Pro版全部功能</li>
            <li className="text-sm text-gray-400">✅ 团队知识共享</li>
            <li className="text-sm text-gray-400">✅ SSO统一登录</li>
            <li className="text-sm text-gray-400">✅ 管理后台</li>
            <li className="text-sm text-gray-400">✅ 私有化部署</li>
          </ul>
          <a href="mailto:sales@example.com" className="block text-center border border-gray-600 hover:border-gray-400 text-gray-300 py-2 rounded-lg text-sm transition-colors">联系销售</a>
        </div>
      </div>
    </section>
  )
}
