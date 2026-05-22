/**
 * Cold start seeding: scan project files on first launch
 * to build initial knowledge graph nodes from the tech stack.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { getDb } from '../../db'
import { createNode } from './knowledge-graph'
import { embed } from './embeddings'

const PROJECT_ROOT = process.cwd()

export async function seedFromProject(): Promise<number> {
  const db = getDb()

  // Check if already seeded
  const existing = db.prepare("SELECT COUNT(*) as count FROM knowledge_nodes WHERE source = 'cold_start'").get() as { count: number }
  if (existing.count > 0) return 0

  let count = 0

  // 1. package.json — tech stack from dependencies
  count += await seedFromPackageJson()

  // 2. tsconfig.json — language features
  count += await seedFromTsConfig()

  // 3. Project structure — detected frameworks
  count += await seedFromProjectStructure()

  // 4. Git context — recent topics
  count += await seedFromGit()

  return count
}

async function seedFromPackageJson(): Promise<number> {
  const pkgPath = join(PROJECT_ROOT, 'package.json')
  if (!existsSync(pkgPath)) return 0

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const names = Object.keys(deps)

    // Group into tech categories
    const categories: Record<string, string[]> = {
      framework: ['react', 'vue', 'angular', 'svelte', 'next', 'nuxt'],
      bundler: ['vite', 'webpack', 'rollup', 'esbuild', 'electron-vite'],
      desktop: ['electron'],
      styling: ['tailwindcss', 'postcss', 'autoprefixer', 'sass', 'less'],
      database: ['better-sqlite3', 'sqlite3', 'prisma', 'drizzle-orm', 'knex'],
      state: ['zustand', 'redux', 'mobx', 'jotai', 'recoil'],
      ai: ['@anthropic-ai/sdk', 'openai', '@xenova/transformers', 'langchain'],
      language: ['typescript'],
      testing: ['vitest', 'jest', 'playwright', 'cypress'],
      css: ['tailwindcss', 'postcss', 'autoprefixer'],
    }

    const matched = new Set<string>()
    for (const name of names) {
      for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(k => name.toLowerCase().includes(k))) {
          matched.add(category)
        }
      }
    }

    // Create a seed node for the project's tech stack
    const stackSummary = Array.from(matched).join(', ')
    const title = `Tech stack: ${pkg.name || 'project'}`
    const content = `Project "${pkg.name || 'unknown'}" v${pkg.version || '0.1.0'} uses: ${Array.from(matched).map(c => `${c}`).join(', ')}.\nKey deps: ${names.slice(0, 15).join(', ')}`

    const embedding = await embed(title + ' ' + content)
    createNode({
      type: 'fact',
      title,
      content,
      summary: stackSummary,
      tags: Array.from(matched),
      source: 'cold_start',
      importance: 0.7,
      confidence: 0.9,
    }, embedding)

    // Create individual tech nodes
    for (const cat of matched) {
      const techNode = `${cat} technology`
      const embedding = await embed(techNode + ` used in ${pkg.name}`)
      createNode({
        type: 'concept',
        title: techNode,
        content: `${cat} is used in project ${pkg.name}`,
        source: 'cold_start',
        importance: 0.5,
      }, embedding)
    }

    return 1 + matched.size
  } catch {
    return 0
  }
}

async function seedFromTsConfig(): Promise<number> {
  const tsPath = join(PROJECT_ROOT, 'tsconfig.json')
  if (!existsSync(tsPath)) return 0

  try {
    const tsconfig = JSON.parse(readFileSync(tsPath, 'utf-8'))
    const features: string[] = []

    if (tsconfig.compilerOptions?.strict) features.push('strict mode')
    if (tsconfig.compilerOptions?.jsx) features.push(`JSX (${tsconfig.compilerOptions.jsx})`)
    if (tsconfig.compilerOptions?.target) features.push(`target: ${tsconfig.compilerOptions.target}`)
    if (tsconfig.compilerOptions?.module) features.push(`module: ${tsconfig.compilerOptions.module}`)

    if (features.length > 0) {
      const content = `TypeScript config: ${features.join(', ')}`
      const embedding = await embed('TypeScript config ' + content)
      createNode({
        type: 'fact',
        title: 'TypeScript configuration',
        content,
        summary: features.join(', '),
        tags: ['typescript', 'config'],
        source: 'cold_start',
        importance: 0.5,
      }, embedding)
      return 1
    }
    return 0
  } catch {
    return 0
  }
}

async function seedFromProjectStructure(): Promise<number> {
  let count = 0

  // Detect if using electron-vite
  if (existsSync(join(PROJECT_ROOT, 'electron.vite.config.ts')) ||
      existsSync(join(PROJECT_ROOT, 'electron.vite.config.mts'))) {
    const embedding = await embed('electron-vite build tool for Electron apps with Vite')
    createNode({
      type: 'fact',
      title: 'Build tool: electron-vite',
      content: 'This project uses electron-vite for building the Electron app with Vite-based HMR.',
      source: 'cold_start',
      importance: 0.5,
    }, embedding)
    count++
  }

  // Detect src/main, src/preload, src/renderer structure (Electron pattern)
  if (existsSync(join(PROJECT_ROOT, 'src/main')) &&
      existsSync(join(PROJECT_ROOT, 'src/preload')) &&
      existsSync(join(PROJECT_ROOT, 'src/renderer'))) {
    const embedding = await embed('Electron app architecture with main process, preload script, and renderer')
    createNode({
      type: 'fact',
      title: 'Architecture: Electron 3-tier',
      content: 'Standard Electron app with main process, preload script (contextBridge), and React renderer.',
      tags: ['electron', 'architecture', 'context-isolation'],
      source: 'cold_start',
      importance: 0.6,
    }, embedding)
    count++
  }

  return count
}

async function seedFromGit(): Promise<number> {
  try {
    const log = execSync('git log --oneline -20', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 5000,
    })

    const keywords = extractKeywords(log)
    if (keywords.length === 0) return 0

    const content = `Recent development topics: ${keywords.join(', ')}`
    const embedding = await embed('git history ' + content)
    createNode({
      type: 'insight',
      title: 'Recent development activity',
      content,
      summary: keywords.join(', '),
      tags: keywords,
      source: 'cold_start',
      importance: 0.4,
    }, embedding)
    return 1
  } catch {
    return 0
  }
}

function extractKeywords(gitLog: string): string[] {
  const words = gitLog.toLowerCase().split(/[\s\-:,.()]+/)
  const techTerms = new Set([
    'fix', 'add', 'update', 'refactor', 'build', 'config', 'electron',
    'react', 'vite', 'ipc', 'component', 'store', 'db', 'api',
    'style', 'theme', 'panel', 'chat', 'session', 'message',
  ])
  const found = new Set<string>()
  for (const word of words) {
    if (techTerms.has(word)) found.add(word)
  }
  return Array.from(found).slice(0, 10)
}
