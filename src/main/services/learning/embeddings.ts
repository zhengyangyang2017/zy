/**
 * Local embeddings using Transformers.js.
 *
 * Uses ONNX runtime to run embedding models locally.
 * Default: all-MiniLM-L6-v2 (384-dim, English-focused, fast).
 * Uses dynamic import because @xenova/transformers is ESM-only.
 *
 * Graceful fallback: if model load fails, returns zero vectors
 * so the app can start without embeddings (keyword search still works).
 */

import type { FeatureExtractionPipeline } from '@xenova/transformers'

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2'
const DIMENSION = 384

let extractor: FeatureExtractionPipeline | null = null
let initPromise: Promise<FeatureExtractionPipeline | null> | null = null
let initFailed = false

async function getExtractor(): Promise<FeatureExtractionPipeline | null> {
  if (initFailed) return null
  if (extractor) return extractor
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const { pipeline } = await import('@xenova/transformers')
      extractor = await pipeline('feature-extraction', MODEL_NAME)
      console.log(`[Embeddings] Model loaded: ${MODEL_NAME}`)
      return extractor
    } catch (err) {
      initFailed = true
      console.error('[Embeddings] Failed to load model, embeddings disabled:', err)
      return null
    }
  })()

  return initPromise
}

/** Convert a single text to a float32 embedding vector */
export async function embed(text: string): Promise<Float32Array> {
  const ext = await getExtractor()
  if (!ext) return new Float32Array(DIMENSION) // zero vector fallback
  const result = await ext(text, { pooling: 'mean', normalize: true })
  return new Float32Array(result.data as unknown as ArrayBuffer)
}

/** Batch embed multiple texts in a single inference call */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  const ext = await getExtractor()
  if (!ext) return texts.map(() => new Float32Array(DIMENSION))
  const results: Float32Array[] = []
  for (const text of texts) {
    const result = await ext(text, { pooling: 'mean', normalize: true })
    results.push(new Float32Array(result.data as unknown as ArrayBuffer))
  }
  return results
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
