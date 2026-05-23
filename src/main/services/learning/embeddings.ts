/**
 * Local embeddings using Transformers.js with remote API fallback.
 *
 * 1. Try loading all-MiniLM-L6-v2 locally via ONNX
 * 2. If local model fails, fall back to remote embedding API
 * 3. If both fail, return zero vectors + set error flag
 *
 * Zero-vector nodes degrade semantic search but FTS5 keyword search still works.
 */

import type { FeatureExtractionPipeline } from '@xenova/transformers'
import https from 'https'
import { IncomingMessage } from 'http'
import { loadConfig } from '../config'
import { logger } from '../logger'

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'
const DIMENSION = 384

let extractor: FeatureExtractionPipeline | null = null
let initPromise: Promise<FeatureExtractionPipeline | null> | null = null
let initFailed = false
let usingRemoteFallback = false
export let embeddingDegraded = false
export let activeEmbeddingModel: string = MODEL_NAME

async function getExtractor(): Promise<FeatureExtractionPipeline | null> {
  if (extractor) return extractor
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const { pipeline } = await import('@xenova/transformers')
      extractor = await pipeline('feature-extraction', MODEL_NAME)
      logger.info('Embeddings', `Local model loaded: ${MODEL_NAME}`)
      return extractor
    } catch (err) {
      initFailed = true
      logger.warn('Embeddings', 'Local model failed, trying remote API fallback')
      return null
    }
  })()

  return initPromise
}

// ============================================
// Remote embedding fallback
// ============================================

async function remoteEmbed(text: string): Promise<Float32Array | null> {
  const cfg = loadConfig()
  if (!cfg.apiKey) return null

  const host = cfg.baseUrl ? new URL(cfg.baseUrl).hostname : 'api.openai.com'
  const path = cfg.baseUrl ? `${new URL(cfg.baseUrl).pathname}/embeddings` : '/v1/embeddings'

  const body = JSON.stringify({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000),
  })

  return new Promise((resolve) => {
    const req = https.request({
      hostname: host,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Length': String(Buffer.byteLength(body)),
      },
      timeout: 15000,
    }, (resp: IncomingMessage) => {
      const chunks: Buffer[] = []
      resp.on('data', (c: Buffer) => chunks.push(c))
      resp.on('end', () => {
        if (resp.statusCode !== 200) { resolve(null); return }
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString())
          const remoteVec = json.data?.[0]?.embedding
          if (Array.isArray(remoteVec) && remoteVec.length > 0) {
            // Pad or truncate to match DIMENSION
            const vec = new Float32Array(DIMENSION)
            for (let i = 0; i < Math.min(remoteVec.length, DIMENSION); i++) {
              vec[i] = remoteVec[i]
            }
            resolve(vec)
          } else {
            resolve(null)
          }
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.write(body)
    req.end()
  })
}

// ============================================
// Public API
// ============================================

/** Convert a single text to a float32 embedding vector */
export async function embed(text: string): Promise<Float32Array> {
  const ext = await getExtractor()
  if (ext) {
    try {
      const result = await ext(text, { pooling: 'mean', normalize: true })
      return new Float32Array(result.data as unknown as ArrayBuffer)
    } catch {
      // Local inference failed at runtime, try remote
    }
  }

  // Remote fallback
  if (!usingRemoteFallback) {
    const remoteVec = await remoteEmbed(text)
    if (remoteVec) {
      if (!usingRemoteFallback) {
        usingRemoteFallback = true
        activeEmbeddingModel = 'text-embedding-3-small'
        logger.info('Embeddings', 'Using remote API for embeddings')
      }
      return remoteVec
    }
  } else {
    const remoteVec = await remoteEmbed(text)
    if (remoteVec) return remoteVec
  }

  // Both failed
  if (!embeddingDegraded) {
    embeddingDegraded = true
    logger.warn('Embeddings', 'All embedding methods failed — semantic search degraded')
  }
  return new Float32Array(DIMENSION)
}

/** Batch embed multiple texts */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const results: Float32Array[] = []
  for (const text of texts) {
    results.push(await embed(text))
  }
  return results
}

export function isEmbeddingDegraded(): boolean {
  return embeddingDegraded
}

/** Encode Float32Array to a Buffer for SQLite BLOB storage */
export function encodeVector(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer)
}

/** Decode a Buffer from SQLite BLOB back to Float32Array */
export function decodeVector(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** Simple in-memory cache for embeddings */
class EmbedCache {
  private cache = new Map<string, Float32Array>()
  private maxSize: number

  constructor(maxSize = 5000) {
    this.maxSize = maxSize
  }

  get(text: string): Float32Array | undefined {
    return this.cache.get(text)
  }

  set(text: string, vec: Float32Array): void {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest 20%
      const keys = Array.from(this.cache.keys())
      for (let i = 0; i < Math.floor(this.maxSize * 0.2); i++) {
        this.cache.delete(keys[i])
      }
    }
    this.cache.set(text, vec)
  }

  clear(): void {
    this.cache.clear()
  }
}

export const embedCache = new EmbedCache()

export function getEmbeddingModel(): string {
  return MODEL_NAME
}

export function getEmbeddingDimension(): number {
  return DIMENSION
}
