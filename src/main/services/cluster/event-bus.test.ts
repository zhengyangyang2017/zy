import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventBus, createEvent } from './event-bus'

describe('EventBus', () => {
  let bus: EventBus

  beforeEach(() => {
    bus = new EventBus(10)
  })

  it('delivers events to matching subscribers', () => {
    const handler = vi.fn()
    bus.subscribe('task:completed', handler)
    const event = createEvent('task:completed', { taskId: '1' }, 'agent_1')
    bus.publish(event)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('does not deliver to non-matching subscribers', () => {
    const handler = vi.fn()
    bus.subscribe('task:completed', handler)
    bus.publish(createEvent('task:failed', {}, 'agent_1'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('supports wildcard patterns (topic:*)', () => {
    const handler = vi.fn()
    bus.subscribe('task:*', handler)
    bus.publish(createEvent('task:completed', {}, 'agent_1'))
    bus.publish(createEvent('task:failed', {}, 'agent_2'))
    bus.publish(createEvent('agent:heartbeat', {}, 'agent_1'))
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('supports full wildcard (*)', () => {
    const handler = vi.fn()
    bus.subscribe('*', handler)
    bus.publish(createEvent('task:completed', {}, 'a'))
    bus.publish(createEvent('agent:heartbeat', {}, 'b'))
    bus.publish(createEvent('workflow:created', {}, 'c'))
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('buffers events up to bufferSize', () => {
    for (let i = 0; i < 15; i++) {
      bus.publish(createEvent('test', i, 'system'))
    }
    const history = bus.getHistory('test')
    expect(history.length).toBe(10) // buffer size
    expect(history[0].payload).toBe(5) // oldest kept
    expect(history[9].payload).toBe(14) // newest
  })

  it('replays buffered events to new subscribers', () => {
    bus.publish(createEvent('task:completed', { id: '1' }, 'a'))
    bus.publish(createEvent('task:completed', { id: '2' }, 'b'))

    const handler = vi.fn()
    bus.subscribe('task:completed', handler)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('returns unsubscribe function that works', () => {
    const handler = vi.fn()
    const unsub = bus.subscribe('test', handler)
    bus.publish(createEvent('test', 'first', 'system'))
    expect(handler).toHaveBeenCalledTimes(1)

    unsub()
    bus.publish(createEvent('test', 'second', 'system'))
    expect(handler).toHaveBeenCalledTimes(1) // no additional calls
  })

  it('isolates async handler errors', () => {
    const badHandler = vi.fn().mockRejectedValue(new Error('boom'))
    const goodHandler = vi.fn()

    bus.subscribe('test', badHandler)
    bus.subscribe('test', goodHandler)
    bus.publish(createEvent('test', {}, 'system'))

    expect(goodHandler).toHaveBeenCalledTimes(1)
  })

  it('tracks subscriber count', () => {
    expect(bus.subscriberCount).toBe(0)
    bus.subscribe('a', vi.fn())
    bus.subscribe('b', vi.fn())
    expect(bus.subscriberCount).toBe(2)
  })
})
