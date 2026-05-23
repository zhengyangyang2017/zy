/**
 * Rate limiter — prevents API abuse and resource exhaustion.
 *
 * Uses token-bucket algorithm per key.
 * Each key has a max burst and refill rate.
 */

interface Bucket {
  tokens: number
  lastRefill: number
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>()
  private maxTokens: number
  private refillRate: number   // tokens per second
  private refillInterval: number // ms between cleanups

  constructor(maxTokens: number = 10, refillPerSecond: number = 2) {
    this.maxTokens = maxTokens
    this.refillRate = refillPerSecond
    this.refillInterval = 30000

    // Periodic cleanup of stale buckets
    setInterval(() => this.cleanup(), this.refillInterval)
  }

  /** Try to consume a token. Returns true if allowed. */
  tryConsume(key: string): boolean {
    const now = Date.now()
    let bucket = this.buckets.get(key)

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now }
      this.buckets.set(key, bucket)
    }

    // Refill
    const elapsed = (now - bucket.lastRefill) / 1000
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + elapsed * this.refillRate)
    bucket.lastRefill = now

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return true
    }

    return false
  }

  /** Get current token count for a key. */
  getTokens(key: string): number {
    return this.buckets.get(key)?.tokens ?? this.maxTokens
  }

  private cleanup(): void {
    const now = Date.now()
    const stale = 5 * 60 * 1000 // 5 minutes
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefill > stale && bucket.tokens >= this.maxTokens) {
        this.buckets.delete(key)
      }
    }
  }
}

/** Singleton for API call rate limiting. */
export const apiRateLimiter = new RateLimiter(5, 1) // 5 burst, 1/s refill

/** Singleton for agent task rate limiting (per task type). */
export const agentRateLimiter = new RateLimiter(3, 0.5) // 3 burst, 0.5/s refill
