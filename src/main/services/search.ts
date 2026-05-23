/**
 * Web search via DuckDuckGo Lite with multi-strategy URL extraction.
 * If one parsing strategy fails, falls back to others.
 */

import https from 'https'
import { IncomingMessage } from 'http'

function httpGet(url: string): Promise<string> {
  const u = new URL(url)
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ClaudeCodeGUI/1.0; ResearchAgent)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: 10000,
    }, (resp: IncomingMessage) => {
      if (resp.statusCode && resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        const redirectUrl = resp.headers.location.startsWith('http')
          ? resp.headers.location
          : `https://${u.hostname}${resp.headers.location}`
        httpGet(redirectUrl).then(resolve).catch(reject)
        return
      }
      const chunks: Buffer[] = []
      resp.on('data', (chunk: Buffer) => chunks.push(chunk))
      resp.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

// ============================================
// URL extraction strategies (ordered by reliability)
// ============================================

/** Strategy 1: DuckDuckGo Lite result-link class */
function extractByResultLink(html: string): string[] {
  const urls: string[] = []
  const regex = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*result-link[^"]*"/g
  let match
  while ((match = regex.exec(html)) !== null) {
    const url = match[1].replace(/&amp;/g, '&')
    if (!url.includes('duckduckgo.com') && !url.includes('localhost')) {
      urls.push(url)
    }
  }
  return urls
}

/** Strategy 2: Any <a> with rel="nofollow" (fallback for DuckDuckGo Lite) */
function extractByNofollow(html: string): string[] {
  const urls: string[] = []
  const regex = /<a[^>]*rel="nofollow"[^>]*href="(https?:\/\/[^"]+)"/gi
  let match
  while ((match = regex.exec(html)) !== null) {
    const url = match[1].replace(/&amp;/g, '&')
    if (!url.includes('duckduckgo.com')) {
      urls.push(url)
    }
  }
  return urls
}

/** Strategy 3: Generic link extraction (broadest, least selective) */
function extractByGeneric(html: string): string[] {
  const urls: string[] = []
  // Find all absolute HTTP links in the body
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const body = bodyMatch ? bodyMatch[1] : html
  const regex = /<a[^>]+href="(https?:\/\/[^"]+)"/gi
  let match
  while ((match = regex.exec(body)) !== null) {
    const url = match[1].replace(/&amp;/g, '&')
    // Filter out common non-result links
    if (
      !url.includes('duckduckgo.com') &&
      !url.includes('google.com') &&
      !url.includes('facebook.com') &&
      !url.includes('twitter.com') &&
      !url.includes('ad.') &&
      !url.includes('sponsored') &&
      !url.includes('tracking') &&
      !url.includes('pixel') &&
      !url.includes('/ads/') &&
      !url.endsWith('.ico') &&
      !url.endsWith('.png') &&
      !url.endsWith('.jpg') &&
      !url.endsWith('.gif') &&
      !url.endsWith('.svg') &&
      !url.endsWith('.css') &&
      !url.endsWith('.js')
    ) {
      urls.push(url)
    }
  }
  // Dedup
  return [...new Set(urls)]
}

/** Strategy 4: DuckDuckGo HTML-only links (strip the DDG redirect wrapper) */
function extractByDDGRedirect(html: string): string[] {
  const urls: string[] = []
  // DuckDuckGo sometimes wraps URLs in redirects like //duckduckgo.com/l/?uddg=ENCODED_URL
  const regex = /uddg=([^&"'\s]+)/g
  let match
  while ((match = regex.exec(html)) !== null) {
    try {
      const decoded = decodeURIComponent(match[1])
      if (decoded.startsWith('https://') || decoded.startsWith('http://')) {
        urls.push(decoded)
      }
    } catch { /* skip malformed */ }
  }
  return urls
}

// ============================================
// Main search function with multi-strategy fallback
// ============================================

export async function searchWeb(query: string, maxResults: number = 5): Promise<string[]> {
  const strategies = [extractByResultLink, extractByNofollow, extractByDDGRedirect, extractByGeneric]
  let html: string | null = null

  for (const strategy of strategies) {
    try {
      if (!html) {
        html = await httpGet(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`)
      }
      const urls = strategy(html)
      if (urls.length > 0) {
        return urls.slice(0, maxResults)
      }
    } catch (err) {
      console.warn(`[Search] Strategy ${strategy.name} failed:`, err)
    }
  }

  return []
}

// ============================================
// Page reading
// ============================================

export interface PageContent {
  url: string
  title: string
  text: string
}

export async function readPage(url: string): Promise<PageContent | null> {
  try {
    const html = await httpGet(url)
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : url

    // Extract text
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim()

    if (text.length > 200) {
      return { url, title, text: text.slice(0, 8000) }
    }
    return null
  } catch {
    return null
  }
}

export async function readPages(urls: string[], maxPages: number = 3): Promise<PageContent[]> {
  const results: PageContent[] = []
  for (const url of urls.slice(0, maxPages)) {
    const page = await readPage(url)
    if (page) results.push(page)
  }
  return results
}
