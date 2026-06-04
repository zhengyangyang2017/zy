import ignore from 'ignore'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

let igFilter: ReturnType<typeof ignore> | null = null
let loadedRoot: string | null = null

function ensureLoaded(rootPath: string): ReturnType<typeof ignore> | null {
  if (igFilter && loadedRoot === rootPath) return igFilter

  igFilter = ignore()
  loadedRoot = rootPath

  const gitignorePath = join(rootPath, '.gitignore')
  try {
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8')
      igFilter.add(content)
    }
  } catch {
    /* .gitignore not readable, proceed without it */
  }

  // Always ignore these
  igFilter.add(['.git', 'node_modules', 'dist', 'out', '.next', '__pycache__', '.DS_Store'])
  return igFilter
}

export function shouldIgnore(rootPath: string, relativePath: string): boolean {
  const filter = ensureLoaded(rootPath)
  if (!filter) return false
  return filter.ignores(relativePath)
}

export function clearGitignoreCache(): void {
  igFilter = null
  loadedRoot = null
}
