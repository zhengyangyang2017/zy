import { describe, it, expect, beforeEach } from 'vitest'
import { RateLimiter } from './rate-limiter'

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter(5, 10) // 5 tokens, fast refill for testing
  })

  it('allows consuming tokens up to max', () => {
    for (let i = 0; i < 5; i++) {
      expect(limiter.tryConsume('test')).toBe(true)
    }
    expect(limiter.tryConsume('test')).toBe(false)
  })

  it('refills tokens over time', async () => {
    for (let i = 0; i < 5; i++) limiter.tryConsume('test')
    expect(limiter.tryConsume('test')).toBe(false)

    await new Promise(r => setTimeout(r, 200))
    expect(limiter.tryConsume('test')).toBe(true)
  })

  it('tracks different keys independently', () => {
    for (let i = 0; i < 5; i++) limiter.tryConsume('key1')
    expect(limiter.tryConsume('key2')).toBe(true)
  })

  it('returns current token count', () => {
    limiter.tryConsume('test')
    limiter.tryConsume('test')
    expect(limiter.getTokens('test')).toBeCloseTo(3, 0)
  })
})
