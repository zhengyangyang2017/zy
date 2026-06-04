export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 py-24 text-center">
      <div className="absolute inset-0 bg-gradient-to-b from-purple-900/20 to-transparent pointer-events-none" />
      <div className="relative max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
          AI 编程助手，
          <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            比你更懂你的代码库
          </span>
        </h1>
        <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
          20个智能体协同工作 · 知识图谱持久记忆 · 自带API Key零隐私风险
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <a href="#download" className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-lg font-medium transition-colors">
            免费下载
          </a>
          <a href="#pricing" className="border border-gray-600 hover:border-gray-400 text-gray-300 px-6 py-3 rounded-lg font-medium transition-colors">
            查看定价
          </a>
        </div>
        <p className="text-xs text-gray-600 mt-4">Windows · macOS · Linux</p>
      </div>
    </section>
  )
}
