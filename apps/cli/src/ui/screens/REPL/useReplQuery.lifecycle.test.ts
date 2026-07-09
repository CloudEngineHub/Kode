import { describe, expect, test } from 'bun:test'
import { createAssistantStreamStore } from './assistantStreamStore'
import { runReplQueryWithCleanup } from './useReplQuery'

type LifecycleCase = {
  name: string
  execute: () => Promise<void>
  rejects: boolean
}

const lifecycleCases: LifecycleCase[] = [
  {
    name: 'normal completion',
    execute: async () => {},
    rejects: false,
  },
  {
    name: 'suppression',
    execute: async () => {},
    rejects: false,
  },
  {
    name: 'early error',
    execute: async () => {
      throw new Error('early failure')
    },
    rejects: true,
  },
  {
    name: 'abort',
    execute: async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    },
    rejects: true,
  },
]

describe('runReplQueryWithCleanup', () => {
  for (const lifecycleCase of lifecycleCases) {
    test(`clears controller, loading state, and stream on ${lifecycleCase.name}`, async () => {
      const controller = new AbortController()
      const streamStore = createAssistantStreamStore()
      streamStore.beginTurn(controller)
      streamStore.handleUpdate(controller, {
        type: 'text_delta',
        delta: 'partial',
      })
      let activeController: AbortController | null = controller
      let isLoading = true

      const promise = runReplQueryWithCleanup({
        controller,
        assistantStreamStore: streamStore,
        clearAbortController: completedController => {
          if (activeController !== completedController) return false
          activeController = null
          return true
        },
        setIsLoading: next => {
          isLoading = next
        },
        execute: lifecycleCase.execute,
      })

      if (lifecycleCase.rejects) {
        await expect(promise).rejects.toBeInstanceOf(Error)
      } else {
        await promise
      }

      expect(activeController).toBeNull()
      expect(isLoading).toBe(false)
      expect(streamStore.getSnapshot().text).toBe('')
    })
  }

  test('an older turn cannot clear a newer controller or stream', async () => {
    const firstController = new AbortController()
    const secondController = new AbortController()
    const streamStore = createAssistantStreamStore()
    let activeController: AbortController | null = firstController
    let isLoading = true
    let finishFirstTurn: (() => void) | undefined

    streamStore.beginTurn(firstController)
    const firstTurn = runReplQueryWithCleanup({
      controller: firstController,
      assistantStreamStore: streamStore,
      clearAbortController: completedController => {
        if (activeController !== completedController) return false
        activeController = null
        return true
      },
      setIsLoading: next => {
        isLoading = next
      },
      execute: () =>
        new Promise<void>(resolve => {
          finishFirstTurn = resolve
        }),
    })

    activeController = secondController
    streamStore.beginTurn(secondController)
    streamStore.handleUpdate(secondController, {
      type: 'text_delta',
      delta: 'new turn',
    })
    finishFirstTurn?.()
    await firstTurn

    expect(activeController).toBe(secondController)
    expect(isLoading).toBe(true)
    expect(streamStore.getSnapshot().text).toBe('new turn')

    await runReplQueryWithCleanup({
      controller: secondController,
      assistantStreamStore: streamStore,
      clearAbortController: completedController => {
        if (activeController !== completedController) return false
        activeController = null
        return true
      },
      setIsLoading: next => {
        isLoading = next
      },
      execute: async () => {},
    })

    expect(activeController).toBeNull()
    expect(isLoading).toBe(false)
    expect(streamStore.getSnapshot().text).toBe('')
  })
})
