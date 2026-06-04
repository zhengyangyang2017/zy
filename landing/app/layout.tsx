import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CodeBuddy — AI 编程助手，比你更懂你的代码库',
  description: '20个智能体协同工作 · 知识图谱持久记忆 · 自带API Key零隐私风险',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
