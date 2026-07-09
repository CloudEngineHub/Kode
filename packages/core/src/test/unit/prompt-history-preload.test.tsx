import { afterEach, describe, expect, test } from 'bun:test'
import React, { useEffect, useRef, useState } from 'react'
import { Box, Text } from 'ink'

import { useArrowKeyHistory } from '#ui-ink/hooks/useArrowKeyHistory'
import {
  createInkHarnessManager,
  createInkTestHarness,
} from '../e2e/inkTestHarness'

describe('prompt history preload', () => {
  const harnessManager = createInkHarnessManager()

  afterEach(async () => {
    await harnessManager.cleanup()
  })

  test('preloads arrow-key history before the first history keypress', async () => {
    let historyReads = 0
    const loadHistory = () => {
      historyReads += 1
      return [{ display: 'cached command', pastedTexts: [] }]
    }

    function HistoryHarness() {
      const [text, setText] = useState('')
      const [scopeKey, setScopeKey] = useState('project-a')
      const { historyIndex, onHistoryUp } = useArrowKeyHistory({
        current: {
          text,
          mode: 'prompt',
          cursorOffset: text.length,
          extra: null,
        },
        emptyExtra: null,
        historyScopeKey: scopeKey,
        loadHistory,
        onRestore: snapshot => setText(snapshot.text),
      })
      const onHistoryUpRef = useRef(onHistoryUp)
      onHistoryUpRef.current = onHistoryUp

      useEffect(() => {
        const historyUpTimer = setTimeout(() => {
          onHistoryUpRef.current()
        }, 140)
        const scopeTimer = setTimeout(() => {
          setScopeKey('project-b')
        }, 220)

        return () => {
          clearTimeout(historyUpTimer)
          clearTimeout(scopeTimer)
        }
      }, [])

      return (
        <Box flexDirection="column">
          <Text>TEXT:{text}</Text>
          <Text>INDEX:{historyIndex}</Text>
          <Text>SCOPE:{scopeKey}</Text>
        </Box>
      )
    }

    const h = createInkTestHarness(<HistoryHarness />)
    harnessManager.track(h)

    await h.wait(180)
    expect(historyReads).toBe(1)
    expect(h.getOutput()).toContain('TEXT:cached command')

    await h.wait(180)

    expect(historyReads).toBe(2)
    expect(h.getOutput()).toContain('SCOPE:project-b')
  })
})
