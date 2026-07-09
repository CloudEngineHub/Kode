import { describe, expect, test } from 'bun:test'
import {
  createAssistantStreamStore,
  type AssistantStreamUpdateEvent,
} from './assistantStreamStore'

function createFakeScheduler() {
  let now = 0
  const tasks: Array<{
    callback: () => void
    dueAt: number
    cancelled: boolean
  }> = []

  return {
    scheduler: {
      now: () => now,
      schedule: (callback: () => void, delayMs: number) => {
        const task = { callback, dueAt: now + delayMs, cancelled: false }
        tasks.push(task)
        return () => {
          task.cancelled = true
        }
      },
    },
    advance(ms: number) {
      now += ms
      const ready = tasks
        .filter(task => !task.cancelled && task.dueAt <= now)
        .sort((a, b) => a.dueAt - b.dueAt)
      for (const task of ready) {
        task.cancelled = true
        task.callback()
      }
    },
    pendingCount() {
      return tasks.filter(task => !task.cancelled).length
    },
  }
}

function update(
  type: AssistantStreamUpdateEvent['type'],
  delta?: string,
  agentId?: string,
  requestId?: string,
): AssistantStreamUpdateEvent {
  return type === 'start'
    ? { type, agentId, requestId }
    : { type, delta: delta ?? '', agentId, requestId }
}

describe('assistantStreamStore', () => {
  test('clears stale retry text on provider start and ignores subagents', () => {
    const store = createAssistantStreamStore()
    const turn = new AbortController()
    store.beginTurn(turn)

    store.handleUpdate(turn, update('text_delta', 'first attempt'))
    expect(store.getSnapshot().text).toBe('first attempt')

    store.handleUpdate(turn, update('start', undefined, 'worker-1'))
    store.handleUpdate(
      turn,
      update('text_delta', 'hidden worker text', 'worker-1'),
    )
    expect(store.getSnapshot().text).toBe('first attempt')

    store.handleUpdate(turn, update('start', undefined, 'main'))
    expect(store.getSnapshot().text).toBe('')

    store.handleUpdate(turn, update('text_delta', 'retry'))
    expect(store.getSnapshot().text).toBe('retry')
  })

  test('publishes the first token immediately and coalesces a burst', () => {
    const fake = createFakeScheduler()
    const store = createAssistantStreamStore({
      frameIntervalMs: 33,
      scheduler: fake.scheduler,
    })
    const turn = new AbortController()
    let publishes = 0
    store.subscribe(() => {
      publishes += 1
    })
    store.beginTurn(turn)

    const emptySnapshot = store.getSnapshot()
    expect(store.getSnapshot()).toBe(emptySnapshot)
    expect(Object.isFrozen(emptySnapshot)).toBe(true)

    store.handleUpdate(turn, update('text_delta', 'a'))
    expect(store.getSnapshot().text).toBe('a')
    expect(publishes).toBe(1)

    for (const delta of ['b', 'c', 'd', 'e', 'f']) {
      store.handleUpdate(turn, update('text_delta', delta))
    }

    expect(store.getSnapshot().text).toBe('a')
    expect(publishes).toBe(1)
    expect(fake.pendingCount()).toBe(1)

    fake.advance(32)
    expect(publishes).toBe(1)

    fake.advance(1)
    expect(store.getSnapshot().text).toBe('abcdef')
    expect(publishes).toBe(2)
    expect(fake.pendingCount()).toBe(0)
  })

  test('does not mix concurrent request streams in the same turn', () => {
    const store = createAssistantStreamStore()
    const turn = new AbortController()
    store.beginTurn(turn)

    store.handleUpdate(turn, update('start', undefined, 'main', 'request-a'))
    store.handleUpdate(turn, update('text_delta', 'A1', 'main', 'request-a'))
    store.handleUpdate(turn, update('text_delta', 'legacy-without-id', 'main'))
    store.handleUpdate(turn, update('start', undefined, 'main', 'request-b'))
    store.handleUpdate(turn, update('text_delta', 'B1', 'main', 'request-b'))
    store.handleUpdate(turn, update('text_delta', 'A2', 'main', 'request-a'))

    expect(store.getSnapshot().text).toBe('A1')

    store.clearPreview(turn)
    store.handleUpdate(turn, update('start', undefined, 'main', 'request-b'))
    store.handleUpdate(turn, update('text_delta', 'B2', 'main', 'request-b'))

    expect(store.getSnapshot().text).toBe('B2')
  })

  test('retains and publishes only the bounded stream tail', () => {
    const fake = createFakeScheduler()
    const store = createAssistantStreamStore({
      frameIntervalMs: 33,
      maxTailChars: 8,
      scheduler: fake.scheduler,
    })
    const turn = new AbortController()
    store.beginTurn(turn)

    store.handleUpdate(turn, update('text_delta', '0123456789'))
    expect(store.getSnapshot().text).toBe('23456789')

    store.handleUpdate(turn, update('text_delta', 'AB'))
    fake.advance(33)
    expect(store.getSnapshot().text).toBe('456789AB')
    expect(store.getSnapshot().text.length).toBe(8)
  })

  test('does not split a surrogate pair at the bounded tail edge', () => {
    const store = createAssistantStreamStore({ maxTailChars: 3 })
    const turn = new AbortController()
    store.beginTurn(turn)

    store.handleUpdate(turn, update('text_delta', 'ab😀cd'))

    expect(store.getSnapshot().text).toBe('cd')
    expect(store.getSnapshot().text).not.toContain('\ud83d')
    expect(store.getSnapshot().text).not.toContain('\ude00')
  })

  test('endTurn cancels pending output without clearing a newer turn', () => {
    const fake = createFakeScheduler()
    const store = createAssistantStreamStore({ scheduler: fake.scheduler })
    const firstTurn = new AbortController()
    const secondTurn = new AbortController()

    store.beginTurn(firstTurn)
    store.handleUpdate(firstTurn, update('text_delta', 'old'))
    store.handleUpdate(firstTurn, update('text_delta', ' pending'))

    store.beginTurn(secondTurn)
    store.handleUpdate(secondTurn, update('text_delta', 'new'))
    store.endTurn(firstTurn)
    fake.advance(100)

    expect(store.getSnapshot().text).toBe('new')
  })
})
