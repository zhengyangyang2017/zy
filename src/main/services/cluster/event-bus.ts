/**
 * Pub/Sub Event Bus — decoupled agent communication.
 *
 * Features:
 * - Topic-based publish/subscribe
 * - Wildcard pattern matching (* suffix only)
 * - Per-topic event buffer (ring buffer, configurable size)
 * - Async handler execution with error isolation
 * - Event correlation via correlationId
 */

import type {
  ClusterEvent,
  EventHandler,
  Subscription,
  TopicPattern,
} from './types'

export class EventBus {
  private subscriptions: Map<string, Subscription[]> = new Map()
  private buffers: Map<string, ClusterEvent[]> = new Map()
  private bufferSize: number
  private subCounter = 0

  constructor(bufferSize: number = 100) {
    this.bufferSize = bufferSize
  }

  /** Publish an event to all matching subscribers. */
  publish(event: ClusterEvent): void {
    // Buffer
    const buf = this.buffers.get(event.topic) || []
    buf.push(event)
    if (buf.length > this.bufferSize) buf.shift()
    this.buffers.set(event.topic, buf)

    // Deliver to matching subscribers
    const matching = this.findMatching(event.topic)
    for (const sub of matching) {
      try {
        const result = sub.handler(event)
        if (result instanceof Promise) {
          result.catch(err =>
            console.error(`[EventBus] Handler error for "${event.topic}":`, err)
          )
        }
      } catch (err) {
        console.error(`[EventBus] Sync handler error for "${event.topic}":`, err)
      }
    }
  }

  /** Subscribe to a topic pattern (e.g., "task:*" or "agent:heartbeat"). */
  subscribe(pattern: TopicPattern, handler: EventHandler): () => void {
    const id = `sub_${++this.subCounter}`
    const sub: Subscription = { id, pattern, handler, createdAt: Date.now() }

    const key = this.normalizePattern(pattern)
    const existing = this.subscriptions.get(key) || []
    existing.push(sub)
    this.subscriptions.set(key, existing)

    // Replay buffered events
    for (const [topic, events] of this.buffers) {
      if (this.matchesPattern(topic, pattern)) {
        for (const event of events) {
          try {
            handler(event)
          } catch { /* replay errors are non-fatal */ }
        }
      }
    }

    // Return unsubscribe function
    return () => {
      const subs = this.subscriptions.get(key)
      if (subs) {
        const idx = subs.findIndex(s => s.id === id)
        if (idx >= 0) subs.splice(idx, 1)
        if (subs.length === 0) this.subscriptions.delete(key)
      }
    }
  }

  /** Get buffered events for a topic. */
  getHistory(topic: TopicPattern, limit?: number): ClusterEvent[] {
    const buf = this.buffers.get(topic) || []
    return limit ? buf.slice(-limit) : [...buf]
  }

  /** Clear all subscriptions and buffers. */
  reset(): void {
    this.subscriptions.clear()
    this.buffers.clear()
    this.subCounter = 0
  }

  /** Get subscription count. */
  get subscriberCount(): number {
    let count = 0
    for (const subs of this.subscriptions.values()) {
      count += subs.length
    }
    return count
  }

  /** Get buffered topic count. */
  get bufferedTopicCount(): number {
    return this.buffers.size
  }

  // ============================================
  // Internal
  // ============================================

  private findMatching(topic: string): Subscription[] {
    const results: Subscription[] = []
    for (const [pattern, subs] of this.subscriptions) {
      if (this.matchesPattern(topic, pattern)) {
        results.push(...subs)
      }
    }
    return results
  }

  private matchesPattern(topic: string, pattern: string): boolean {
    if (pattern === topic) return true
    if (pattern === '*') return true
    if (pattern.endsWith(':*')) {
      const prefix = pattern.slice(0, -2)
      return topic === prefix || topic.startsWith(prefix + ':')
    }
    if (pattern.endsWith('*') && !pattern.includes(':')) {
      return topic.startsWith(pattern.slice(0, -1))
    }
    return false
  }

  private normalizePattern(pattern: string): string {
    // Collapse consecutive wildcards
    return pattern.replace(/\*+/g, '*')
  }
}

/** Singleton instance. */
let busInstance: EventBus | null = null

export function getEventBus(bufferSize?: number): EventBus {
  if (!busInstance) {
    busInstance = new EventBus(bufferSize)
  }
  return busInstance
}

export function resetEventBus(): void {
  busInstance?.reset()
  busInstance = null
}

// ============================================
// Event helpers
// ============================================

let eventCounter = 0

export function createEvent(
  topic: TopicPattern,
  payload: unknown,
  source: ClusterEvent['source'] = 'system',
  correlationId?: string,
): ClusterEvent {
  return {
    id: `evt_${++eventCounter}_${Date.now()}`,
    topic,
    payload,
    source,
    ts: Date.now(),
    correlationId,
  }
}
