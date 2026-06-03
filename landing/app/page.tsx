import { Hero } from '@/components/Hero'
import { Features } from '@/components/Features'
import { Pricing } from '@/components/Pricing'
import { FAQ } from '@/components/FAQ'

export default function Home() {
  return (
    <main className="min-h-screen bg-surface">
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-lg font-bold text-white">🔤 CodeBuddy</span>
        <div className="flex gap-6 text-sm text-gray-400">
          <a href="#features" className="hover:text-white transition-colors">功能</a>
          <a href="#pricing" className="hover:text-white transition-colors">定价</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
        </div>
      </nav>
      <Hero />
      <Features />
      <Pricing />
      <FAQ />
      <footer className="text-center py-12 text-xs text-gray-600 border-t border-gray-800">
        <p>&copy; 2026 CodeBuddy. Built with &#x2764;&#xFE0F; for developers.</p>
        <p className="mt-1">ICP备XXXXXXXX号-X | 联系我们: hi@example.com</p>
      </footer>
    </main>
  )
}
