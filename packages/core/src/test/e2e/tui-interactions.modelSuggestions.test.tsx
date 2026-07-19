import { afterEach, describe, expect, test } from 'bun:test'
import { Text } from 'ink'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useModelSuggestions } from '#ui-ink/hooks/useUnifiedCompletion/useModelSuggestions'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

type ModelSuggestionsController = {
  setModels?: (models: string[]) => void
  reload?: () => void
}

function ModelSuggestionsHarness({
  controller,
  onLoadModelNames,
}: {
  controller: ModelSuggestionsController
  onLoadModelNames?: () => void
}) {
  const [reloadKey, setReloadKey] = useState(0)
  const [, forceRender] = useState(0)
  const modelsRef = useRef(['alpha'])
  const getModelNames = useCallback(() => {
    onLoadModelNames?.()
    return modelsRef.current
  }, [onLoadModelNames])

  useEffect(() => {
    controller.setModels = models => {
      modelsRef.current = models
      forceRender(prev => prev + 1)
    }
    controller.reload = () => {
      setReloadKey(prev => prev + 1)
    }
  }, [controller])

  const { suggestions, isLoading } = useModelSuggestions({
    enabled: true,
    reloadKey,
    getModelNames,
  })

  return (
    <Text>
      {isLoading ? 'loading' : 'ready'}:
      {suggestions.map(suggestion => suggestion.value).join(',')}
    </Text>
  )
}

describe('TUI E2E regression (Ink render): model suggestions', () => {
  const harnessManager = createInkHarnessManager()

  afterEach(async () => {
    await harnessManager.cleanup()
  })

  test('reloads ask-model suggestions when the model reload key changes', async () => {
    const controller: ModelSuggestionsController = {}
    let loadCount = 0
    const getLoadCount = () => loadCount

    const h = createInkTestHarness(
      <ModelSuggestionsHarness
        controller={controller}
        onLoadModelNames={() => {
          loadCount += 1
        }}
      />,
    )
    harnessManager.track(h)

    await h.wait(50)
    expect(h.getOutput()).toContain('ask-alpha')
    expect(getLoadCount()).toBe(1)

    h.clearOutput()
    controller.setModels?.(['beta'])
    await h.wait(50)
    expect(getLoadCount()).toBe(1)

    h.clearOutput()
    controller.reload?.()
    await h.wait(50)
    expect(h.getOutput()).toContain('ask-beta')
    expect(getLoadCount()).toBe(2)
  })
})
