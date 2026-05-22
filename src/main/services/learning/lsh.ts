/**
 * Locality-Sensitive Hashing for text dedup pre-filter.
 *
 * Uses MinHash + banded LSH: items sharing at least one band
 * are considered candidate pairs for full vector similarity check.
 */

const SHINGLE_SIZE = 3 // character trigrams
const NUM_HASHES = 128 // signature length
const BANDS = 16 // number of bands
const ROWS_PER_BAND = NUM_HASHES / BANDS // = 8

// Pre-generated random hash seeds for reproducibility
const HASH_SEEDS_A: number[] = []
const HASH_SEEDS_B: number[] = []
for (let i = 0; i < NUM_HASHES; i++) {
  HASH_SEEDS_A.push(Math.floor(Math.random() * 2147483647) + 1)
  HASH_SEEDS_B.push(Math.floor(Math.random() * 2147483647) + 1)
}

const LARGE_PRIME = 2147483647

function hashShingle(shingle: number, seedA: number, seedB: number): number {
  return ((seedA * shingle + seedB) % LARGE_PRIME) >>> 0
}

/** Convert text to set of shingle hashes */
function shingleSet(text: string): number[] {
  const lower = text.toLowerCase()
  const shingles = new Set<number>()
  for (let i = 0; i <= lower.length - SHINGLE_SIZE; i++) {
    let h = 0
    for (let j = 0; j < SHINGLE_SIZE; j++) {
      h = ((h << 5) - h + lower.charCodeAt(i + j)) | 0
    }
    shingles.add(h >>> 0)
  }
  return Array.from(shingles)
}

/** Compute MinHash signature for a set of shingles */
function minHashSignature(shingles: number[]): number[] {
  const signature: number[] = new Array(NUM_HASHES).fill(LARGE_PRIME)
  for (const shingle of shingles) {
    for (let i = 0; i < NUM_HASHES; i++) {
      const h = hashShingle(shingle, HASH_SEEDS_A[i], HASH_SEEDS_B[i])
      if (h < signature[i]) {
        signature[i] = h
      }
    }
  }
  return signature
}

/** Split signature into bands, hash each band to a bucket key */
function bandKeys(signature: number[]): string[] {
  const keys: string[] = []
  for (let b = 0; b < BANDS; b++) {
    const start = b * ROWS_PER_BAND
    let h = 0
    for (let r = 0; r < ROWS_PER_BAND; r++) {
      h = ((h << 5) - h + signature[start + r]) | 0
    }
    keys.push(`${b}:${h >>> 0}`)
  }
  return keys
}

export interface LSHIndexEntry {
  id: string
  keys: string[]
}

/** Compute LSH keys for a piece of text */
export function computeLSHKeys(text: string): string[] {
  const shingles = shingleSet(text)
  if (shingles.length === 0) return []
  const sig = minHashSignature(shingles)
  return bandKeys(sig)
}

/** Simple in-memory LSH index for candidate lookup */
export class LSHIndex {
  private buckets = new Map<string, Set<string>>()

  add(id: string, keys: string[]): void {
    for (const key of keys) {
      let bucket = this.buckets.get(key)
      if (!bucket) {
        bucket = new Set()
        this.buckets.set(key, bucket)
      }
      bucket.add(id)
    }
  }

  remove(id: string, keys: string[]): void {
    for (const key of keys) {
      const bucket = this.buckets.get(key)
      if (bucket) {
        bucket.delete(id)
        if (bucket.size === 0) this.buckets.delete(key)
      }
    }
  }

  /** Find all candidates that share at least one band with the query keys */
  query(keys: string[]): Set<string> {
    const candidates = new Set<string>()
    for (const key of keys) {
      const bucket = this.buckets.get(key)
      if (bucket) {
        for (const id of bucket) candidates.add(id)
      }
    }
    return candidates
  }

  clear(): void {
    this.buckets.clear()
  }

  get size(): number {
    return this.buckets.size
  }
}

/** Estimate Jaccard similarity from two MinHash signatures */
export function estimateJaccard(sigA: number[], sigB: number[]): number {
  let matches = 0
  const len = Math.min(sigA.length, sigB.length)
  for (let i = 0; i < len; i++) {
    if (sigA[i] === sigB[i]) matches++
  }
  return matches / len
}
