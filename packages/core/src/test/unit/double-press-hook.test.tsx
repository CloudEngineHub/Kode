import { afterEach, describe, expect, test } from 'bun:test'
import React, { useEffect, useRef } from 'react'
import { Text } from 'ink'

import {
  DOUBLE_PRESS_TIMEOUT_MS,
  useDoublePress,
} from '#ui-ink/hooks/useDoublePress'
import { createInkHarnessManager, createInkTestHarness } from '../e2e/inkTestHarness'

describe('useDoublePress', () => {
  const harnessManager = createInkHarnessManager()

  afterEach(async () => {
    await harnessManager.cleanup()
  })

  function DoublePressHarness({
    pressAtMs,
    setPending,
    onDoublePress,
    onFirstPress,
  }: {
    pressAtMs: number[]
    setPending: (pending: boolean) => void
    onDoublePress: () => void
    onFirstPress?: () => void
  }) {
    const handlePress = useDoublePress(
      setPending,
      onDoublePress,
      onFirstPress,
    )
    const handlePressRef = useRef(handlePress)
    handlePressRef.current = handlePress

    useEffect(() => {
      const timers = pressAtMs.map(ms =>
        setTimeout(() => handlePressRef.current(), ms),
      )
      return () => {
        timers.forEach(timer => clearTimeout(timer))
      }
    }, [pressAtMs])

    return <Text>ready</Text>
  }

  test('keeps first and double press behavior intact', async () => {
    const calls: string[] = []
    const h = createInkTestHarness(
      <DoublePressHarness
        pressAtMs={[0, 25]}
        setPending={pending => calls.push(`pending:${String(pending)}`)}
        onDoublePress={() => calls.push('double')}
        onFirstPress={() => calls.push('first')}
      />,
    )
    harnessManager.track(h)

    await h.wait(100)

    expect(calls).toEqual(['first', 'pending:true', 'double', 'pending:false'])
  })

  test('clears the pending timer on unmount', async () => {
    const calls: string[] = []
    const h = createInkTestHarness(
      <DoublePressHarness
        pressAtMs={[0]}
        setPending={pending => calls.push(`pending:${String(pending)}`)}
        onDoublePress={() => calls.push('double')}
      />,
    )
    harnessManager.track(h)

    await h.wait(50)
    h.unmount()
    await h.wait(DOUBLE_PRESS_TIMEOUT_MS + 50)

    expect(calls).toEqual(['pending:true'])
  })
})
