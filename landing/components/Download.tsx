const PLATFORMS = [
  {
    icon: '🪟',
    name: 'Windows',
    ext: '.exe',
    desc: 'Windows 10/11 x64',
    href: 'https://github.com/your-repo/releases/latest/download/CodeBuddy-Setup.exe',
  },
  {
    icon: '🍎',
    name: 'macOS',
    ext: '.dmg',
    desc: 'macOS 12+ (Intel / Apple Silicon)',
    href: 'https://github.com/your-repo/releases/latest/download/CodeBuddy.dmg',
  },
  {
    icon: '🐧',
    name: 'Linux',
    ext: '.AppImage',
    desc: 'Ubuntu 20.04+ / Debian / Fedora',
    href: 'https://github.com/your-repo/releases/latest/download/CodeBuddy.AppImage',
  },
]

export function Download() {
  return (
    <section id="download" className="px-6 py-20 max-w-4xl mx-auto text-center">
      <h2 className="text-3xl font-bold text-white mb-4">下载 CodeBuddy</h2>
      <p className="text-gray-400 mb-12">安装即享 7 天 Pro 全功能试用，无需注册</p>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        {PLATFORMS.map((p) => (
          <a
            key={p.name}
            href={p.href}
            className="bg-white/5 border border-gray-700/50 rounded-xl p-6 hover:border-purple-500/50 hover:bg-white/10 transition-all group"
          >
            <div className="text-4xl mb-3">{p.icon}</div>
            <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-purple-400 transition-colors">
              {p.name}
            </h3>
            <p className="text-xs text-gray-500 mb-3">{p.desc}</p>
            <span className="text-sm text-purple-400 font-medium">
              下载 {p.ext}
            </span>
          </a>
        ))}
      </div>

      <p className="text-xs text-gray-600">
        下载即表示同意服务条款和隐私政策 · 支持自动更新
      </p>
    </section>
  )
}
