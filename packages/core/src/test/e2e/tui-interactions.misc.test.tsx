import { afterEach, describe, expect, test } from 'bun:test'
import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import { AskUserQuestionPermissionRequest } from '#ui-ink/components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest'
import { AskUserQuestionTool } from '#tools/tools/interaction/AskUserQuestionTool/AskUserQuestionTool'
import { BashToolRunInBackgroundOverlay } from '#tools/tools/system/BashTool/BashToolRunInBackgroundOverlay'
import {
  createAssistantMessage,
  createProgressMessage,
  normalizeMessages,
  reorderMessages,
} from '#core/utils/messages'
import type { Message as KodeMessage } from '#core/query'
import { Message } from '#ui-ink/components/Message'
import { MessageResponse } from '#ui-ink/components/MessageResponse'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'
import { Select } from '#ui-ink/components/CustomSelect/select'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useMouse } from '#ui-ink/hooks/useMouse'

const harnessManager = createInkHarnessManager()

afterEach(async () => {
  await harnessManager.cleanup()
})

describe('TUI E2E regression (Ink render): Misc', () => {
  test('AskUserQuestion: select Other, type, Enter submits answer', async () => {
    let allowed = false
    let done = false
    const input: any = {
      questions: [
        {
          question: 'What type of Snake game would you like?',
          header: 'Snake Game Requirements',
          multiSelect: false,
          options: [
            {
              label: 'HTML5 Canvas version (web browser)',
              description: 'Playable in browser',
            },
            {
              label: 'Terminal/Console version',
              description: 'Playable in terminal',
            },
          ],
        },
      ],
    }

    const toolUseConfirm: any = {
      assistantMessage: createAssistantMessage(''),
      tool: AskUserQuestionTool,
      description: 'Ask user question',
      input,
      commandPrefix: null,
      toolUseContext: {
        messageId: 'm',
        abortController: new AbortController(),
        readFileTimestamps: {},
      },
      riskScore: null,
      onAbort: () => {},
      onAllow: () => {
        allowed = true
      },
      onReject: () => {},
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <AskUserQuestionPermissionRequest
          toolUseConfirm={toolUseConfirm}
          onDone={() => {
            done = true
          }}
          verbose={false}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)

    h.stdin.write('\u001B[B')
    await h.wait(10)
    h.stdin.write('\u001B[B')
    await h.wait(10)

    for (const ch of 'threejs') {
      h.stdin.write(ch)
      await h.wait(5)
    }

    h.stdin.write('\r')
    await h.wait(25)

    expect(allowed).toBe(true)
    expect(done).toBe(true)
    const stored =
      toolUseConfirm.toolUseContext.options?.askUserQuestionAnswersByToolUseId
        ?.m
    expect(stored?.['What type of Snake game would you like?']).toBe('threejs')
  })

  test('AskUserQuestion: digit key selects a numbered option', async () => {
    let allowed = false
    let done = false
    const input: any = {
      questions: [
        {
          question: '剩余9个未合并的功能分支，是否也要删除？',
          header: '未合并分支',
          multiSelect: false,
          options: [
            {
              label: '全部删除，只留main',
              description: '删除所有codex/*、feat/*、guard/*、worktree/*分支',
            },
            {
              label: '保留不动',
              description: '这些未合并分支可能还有用，先保留',
            },
          ],
        },
      ],
    }

    const toolUseConfirm: any = {
      assistantMessage: createAssistantMessage(''),
      tool: AskUserQuestionTool,
      description: 'Ask user question',
      input,
      commandPrefix: null,
      toolUseContext: {
        messageId: 'm',
        abortController: new AbortController(),
        readFileTimestamps: {},
      },
      riskScore: null,
      onAbort: () => {},
      onAllow: () => {
        allowed = true
      },
      onReject: () => {},
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <AskUserQuestionPermissionRequest
          toolUseConfirm={toolUseConfirm}
          onDone={() => {
            done = true
          }}
          verbose={false}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    expect(h.getOutput()).toContain('1. 全部删除，只留main')
    expect(h.getOutput()).toContain('2. 保留不动')
    expect(h.getOutput()).toContain('3. Other')

    h.stdin.write('2')
    await h.wait(25)

    expect(allowed).toBe(true)
    expect(done).toBe(true)
    const stored =
      toolUseConfirm.toolUseContext.options?.askUserQuestionAnswersByToolUseId
        ?.m
    expect(stored?.['剩余9个未合并的功能分支，是否也要删除？']).toBe('保留不动')
  })

  test('Select: SGR mouse click selects the clicked option without leaking key input', async () => {
    let selected = ''
    let leakedKeypresses = 0

    function SelectHarness(): React.ReactNode {
      useKeypress(() => {
        leakedKeypresses += 1
      })

      return (
        <Select
          options={[
            { label: 'First', value: 'first' },
            { label: 'Second', value: 'second' },
            { label: 'Third', value: 'third' },
          ]}
          onChange={value => {
            selected = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)

    h.stdin.write('\x1b[<0;3;2M')
    await h.wait(25)

    expect(selected).toBe('second')
    expect(leakedKeypresses).toBe(0)
  })

  test('Select: grouped options focus the first selectable option', async () => {
    let selected = ''

    const h = createInkTestHarness(
      <KeypressProvider>
        <Select
          options={[
            {
              header: 'Group',
              options: [
                { label: 'First', value: 'first' },
                { label: 'Second', value: 'second' },
              ],
            },
          ]}
          onChange={value => {
            selected = value
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('\r')
    await h.wait(25)

    expect(selected).toBe('first')
  })

  test('Select: digit key selects the matching visible option', async () => {
    let selected = ''

    const h = createInkTestHarness(
      <KeypressProvider>
        <Select
          options={[
            {
              header: 'Group',
              options: [
                { label: 'First', value: 'first' },
                { label: 'Second', value: 'second' },
              ],
            },
            {
              header: 'More',
              options: [{ label: 'Third', value: 'third' }],
            },
          ]}
          onChange={value => {
            selected = value
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('2')
    await h.wait(25)

    expect(selected).toBe('second')
  })

  test('Select: unstable onFocus callback does not create a parent update loop', async () => {
    let focusCalls = 0

    function SelectUnstableOnFocusHarness(): React.ReactNode {
      const [focusMeta, setFocusMeta] = useState({ value: '' })

      return (
        <Box flexDirection="column">
          <Text>FOCUS:{focusMeta.value}</Text>
          <Select
            options={[
              { label: 'First', value: 'first' },
              { label: 'Second', value: 'second' },
            ]}
            onFocus={value => {
              focusCalls += 1
              setFocusMeta({ value })
            }}
          />
        </Box>
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectUnstableOnFocusHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(100)

    expect(focusCalls).toBe(1)
    expect(h.getOutput()).toContain('FOCUS:first')

    h.stdin.write('\u001B[B')
    await h.wait(100)

    expect(focusCalls).toBe(2)
    expect(h.getOutput()).toContain('FOCUS:second')
  })

  test('Select: selected value is consumed across keep-alive rerenders', async () => {
    let selectedCount = 0

    function SelectActionHarness(): React.ReactNode {
      const [tick, setTick] = useState(0)

      useEffect(() => {
        const intervalId = setInterval(() => {
          setTick(prev => prev + 1)
        }, 30)
        return () => clearInterval(intervalId)
      }, [])

      return (
        <Select
          options={[
            { label: `Reconnect ${tick}`, value: 'reconnect' },
            { label: `Disable ${tick}`, value: 'disable' },
          ]}
          onChange={() => {
            selectedCount += 1
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectActionHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(60)
    h.stdin.write('\r')
    await h.wait(150)

    expect(selectedCount).toBe(1)

    h.stdin.write('\r')
    await h.wait(120)

    expect(selectedCount).toBe(2)
  })

  test('Select: down-arrow focus survives keep-alive style rerenders', async () => {
    let focused = ''

    function SelectKeepAliveHarness(): React.ReactNode {
      const [tick, setTick] = useState(0)

      useEffect(() => {
        const intervalId = setInterval(() => {
          setTick(prev => prev + 1)
        }, 30)
        return () => clearInterval(intervalId)
      }, [])

      return (
        <Select
          options={[
            { label: `First ${tick}`, value: 'first' },
            { label: `Second ${tick}`, value: 'second' },
            { label: `Third ${tick}`, value: 'third' },
          ]}
          onFocus={value => {
            focused = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectKeepAliveHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(60)
    expect(focused).toBe('first')

    h.stdin.write('\u001B[B')
    await h.wait(150)

    expect(focused).toBe('second')
  })

  test('Select: down-arrow focus is not pulled back by stale focusValue during keep-alive rerenders', async () => {
    let focused = ''

    function SelectControlledKeepAliveHarness(): React.ReactNode {
      const [tick, setTick] = useState(0)

      useEffect(() => {
        const intervalId = setInterval(() => {
          setTick(prev => prev + 1)
        }, 30)
        return () => clearInterval(intervalId)
      }, [])

      return (
        <Select
          focusValue="first"
          options={[
            { label: `First ${tick}`, value: 'first' },
            { label: `Second ${tick}`, value: 'second' },
            { label: `Third ${tick}`, value: 'third' },
          ]}
          onFocus={value => {
            focused = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectControlledKeepAliveHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(60)
    expect(focused).toBe('first')

    h.stdin.write('\u001B[B')
    await h.wait(150)

    expect(focused).toBe('second')
  })

  test('Select: down-arrow focus survives transient empty keep-alive options', async () => {
    let focused = ''

    function SelectTransientOptionsHarness(): React.ReactNode {
      const [showOptions, setShowOptions] = useState(true)

      useEffect(() => {
        const timers = [
          setTimeout(() => setShowOptions(false), 80),
          setTimeout(() => setShowOptions(true), 130),
          setTimeout(() => setShowOptions(false), 180),
          setTimeout(() => setShowOptions(true), 230),
        ]
        return () => {
          for (const timer of timers) clearTimeout(timer)
        }
      }, [])

      return (
        <Select
          focusValue="first"
          options={
            showOptions
              ? [
                  { label: 'First', value: 'first' },
                  { label: 'Second', value: 'second' },
                  { label: 'Third', value: 'third' },
                ]
              : []
          }
          onFocus={value => {
            focused = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectTransientOptionsHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(40)
    expect(focused).toBe('first')

    h.stdin.write('\u001B[B')
    await h.wait(30)
    expect(focused).toBe('second')

    await h.wait(240)

    expect(focused).toBe('second')
  })

  test('Select: down-arrow focus survives transient keep-alive options missing the focused value', async () => {
    let focused = ''
    let selected = ''

    function SelectTransientMissingFocusedOptionHarness(): React.ReactNode {
      const [mode, setMode] = useState<'full' | 'missing'>('full')
      const [focusValue, setFocusValue] = useState<string | undefined>('first')

      useEffect(() => {
        if (focusValue !== 'second') return

        const timers = [
          setTimeout(() => setMode('missing'), 80),
          setTimeout(() => setMode('full'), 150),
        ]
        return () => {
          for (const timer of timers) clearTimeout(timer)
        }
      }, [focusValue])

      return (
        <Select
          focusValue={focusValue}
          options={
            mode === 'full'
              ? [
                  { label: 'First', value: 'first' },
                  { label: 'Second', value: 'second' },
                  { label: 'Third', value: 'third' },
                ]
              : [
                  { label: 'First', value: 'first' },
                  { label: 'Third', value: 'third' },
                ]
          }
          onFocus={value => {
            focused = value
            setFocusValue(value)
          }}
          onChange={value => {
            selected = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectTransientMissingFocusedOptionHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(40)
    expect(focused).toBe('first')

    h.stdin.write('\u001B[B')
    await h.wait(60)
    expect(focused).toBe('second')

    await h.wait(180)
    expect(focused).toBe('second')

    h.stdin.write('\r')
    await h.wait(40)

    expect(selected).toBe('second')
  })

  test('Select: uncontrolled focus survives transient keep-alive options missing the focused value', async () => {
    let focused = ''
    let selected = ''

    function SelectUncontrolledTransientMissingOptionHarness(): React.ReactNode {
      const [mode, setMode] = useState<'full' | 'missing'>('full')
      const [focusedValue, setFocusedValue] = useState('')

      useEffect(() => {
        if (focusedValue !== 'second') return

        setMode('missing')
        const timers = [setTimeout(() => setMode('full'), 120)]
        return () => {
          for (const timer of timers) clearTimeout(timer)
        }
      }, [focusedValue])

      return (
        <Select
          options={
            mode === 'full'
              ? [
                  { label: 'First', value: 'first' },
                  { label: 'Second', value: 'second' },
                  { label: 'Third', value: 'third' },
                ]
              : [
                  { label: 'First', value: 'first' },
                  { label: 'Third', value: 'third' },
                ]
          }
          onFocus={value => {
            focused = value
            setFocusedValue(value)
          }}
          onChange={value => {
            selected = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectUncontrolledTransientMissingOptionHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(40)
    expect(focused).toBe('first')

    h.stdin.write('\u001B[B')
    await h.wait(30)
    expect(focused).toBe('second')

    h.clearOutput()
    await h.wait(60)
    expect(h.getOutput()).not.toContain('Second')

    h.stdin.write('\r')
    await h.wait(30)
    expect(selected).toBe('')

    await h.wait(120)
    expect(focused).toBe('second')

    h.stdin.write('\r')
    await h.wait(40)

    expect(selected).toBe('second')
  })

  test('Select: down-arrow during transient keep-alive removal advances from the stale focus position', async () => {
    let focused = ''
    let selected = ''

    function SelectNavigateDuringMissingOptionHarness(): React.ReactNode {
      const [mode, setMode] = useState<'full' | 'missing'>('full')
      const [focusedValue, setFocusedValue] = useState('')

      useEffect(() => {
        if (focusedValue !== 'second') return

        setMode('missing')
        const timer = setTimeout(() => setMode('full'), 120)
        return () => clearTimeout(timer)
      }, [focusedValue])

      return (
        <Select
          options={
            mode === 'full'
              ? [
                  { label: 'First', value: 'first' },
                  { label: 'Second', value: 'second' },
                  { label: 'Third', value: 'third' },
                ]
              : [
                  { label: 'First', value: 'first' },
                  { label: 'Third', value: 'third' },
                ]
          }
          onFocus={value => {
            focused = value
            setFocusedValue(value)
          }}
          onChange={value => {
            selected = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectNavigateDuringMissingOptionHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(40)
    expect(focused).toBe('first')

    h.stdin.write('\u001B[B')
    await h.wait(30)
    expect(focused).toBe('second')

    h.clearOutput()
    await h.wait(30)
    expect(h.getOutput()).not.toContain('Second')

    h.stdin.write('\u001B[B')
    await h.wait(40)
    expect(focused).toBe('third')

    await h.wait(130)
    expect(focused).toBe('third')

    h.stdin.write('\r')
    await h.wait(40)

    expect(selected).toBe('third')
  })

  test('Select: parent-synced focus survives a keep-alive remount', async () => {
    let focused = ''
    let selected = ''

    function SelectRemountHarness(): React.ReactNode {
      const [showSelect, setShowSelect] = useState(true)
      const [focusValue, setFocusValue] = useState<string | undefined>('first')

      useEffect(() => {
        const timers = [
          setTimeout(() => setShowSelect(false), 90),
          setTimeout(() => setShowSelect(true), 140),
        ]
        return () => {
          for (const timer of timers) clearTimeout(timer)
        }
      }, [])

      if (!showSelect) return <Box />

      return (
        <Select
          focusValue={focusValue}
          options={[
            { label: 'First', value: 'first' },
            { label: 'Second', value: 'second' },
            { label: 'Third', value: 'third' },
          ]}
          onFocus={value => {
            focused = value
            setFocusValue(value)
          }}
          onChange={value => {
            selected = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectRemountHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(40)
    expect(focused).toBe('first')

    h.stdin.write('\u001B[B')
    await h.wait(40)
    expect(focused).toBe('second')

    await h.wait(140)
    expect(focused).toBe('second')

    h.stdin.write('\r')
    await h.wait(40)

    expect(selected).toBe('second')
  })

  test('Select: parent focus is persisted before an interrupting keep-alive remount', async () => {
    let focused = ''
    let selected = ''

    function SelectInterruptedRemountHarness(): React.ReactNode {
      const [showSelect, setShowSelect] = useState(true)
      const [focusValue, setFocusValue] = useState<string | undefined>('first')

      useKeypress(
        (_input, key) => {
          if (!key.downArrow) return

          setShowSelect(false)
          setTimeout(() => setShowSelect(true), 0)
          return false
        },
        { priority: 10 },
      )

      if (!showSelect) return <Text>Loading actions...</Text>

      return (
        <Select
          focusValue={focusValue}
          options={[
            { label: 'First', value: 'first' },
            { label: 'Second', value: 'second' },
            { label: 'Third', value: 'third' },
          ]}
          onFocus={value => {
            focused = value
            setFocusValue(value)
          }}
          onChange={value => {
            selected = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectInterruptedRemountHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(40)
    expect(focused).toBe('first')

    h.stdin.write('\u001B[B')
    await h.wait(80)
    expect(focused).toBe('second')

    h.stdin.write('\r')
    await h.wait(40)

    expect(selected).toBe('second')
  })

  test('Select: repeated down-arrow focus is persisted before a keep-alive remount', async () => {
    let focused = ''
    let selected = ''

    function SelectRepeatedKeyRemountHarness(): React.ReactNode {
      const [showSelect, setShowSelect] = useState(true)
      const [focusValue, setFocusValue] = useState<string | undefined>('first')

      useKeypress(
        (_input, key) => {
          if (!key.downArrow) return

          setTimeout(() => {
            setShowSelect(false)
            setTimeout(() => setShowSelect(true), 0)
          }, 0)
          return false
        },
        { priority: 10 },
      )

      if (!showSelect) return <Text>Loading actions...</Text>

      return (
        <Select
          focusValue={focusValue}
          options={[
            { label: 'First', value: 'first' },
            { label: 'Second', value: 'second' },
            { label: 'Third', value: 'third' },
          ]}
          onFocus={value => {
            focused = value
            setFocusValue(value)
          }}
          onChange={value => {
            selected = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectRepeatedKeyRemountHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(40)
    expect(focused).toBe('first')

    h.stdin.write('\u001B[B\u001B[B')
    await h.wait(100)
    expect(focused).toBe('third')

    h.stdin.write('\r')
    await h.wait(40)

    expect(selected).toBe('third')
  })

  test('Select: focusValue is applied after options arrive from keep-alive loading', async () => {
    let focused = ''

    function SelectDeferredOptionsHarness(): React.ReactNode {
      const [tick, setTick] = useState(0)

      useEffect(() => {
        const intervalId = setInterval(() => {
          setTick(prev => prev + 1)
        }, 30)
        return () => clearInterval(intervalId)
      }, [])

      const options =
        tick < 2
          ? []
          : [
              { label: `First ${tick}`, value: 'first' },
              { label: `Second ${tick}`, value: 'second' },
              { label: `Third ${tick}`, value: 'third' },
            ]

      return (
        <Select
          focusValue="second"
          options={options}
          onFocus={value => {
            focused = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectDeferredOptionsHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(150)

    expect(focused).toBe('second')
  })

  test('Select: keep-alive label rerenders do not recenter the visible window', async () => {
    let focused = ''

    function SelectKeepAliveWindowHarness(): React.ReactNode {
      const [tick, setTick] = useState(0)

      useEffect(() => {
        const intervalId = setInterval(() => {
          setTick(prev => prev + 1)
        }, 30)
        return () => clearInterval(intervalId)
      }, [])

      return (
        <Select
          visibleOptionCount={3}
          options={[
            { label: `Alpha ${tick}`, value: 'alpha' },
            { label: `Beta ${tick}`, value: 'beta' },
            { label: `Gamma ${tick}`, value: 'gamma' },
            { label: `Delta ${tick}`, value: 'delta' },
            { label: `Epsilon ${tick}`, value: 'epsilon' },
          ]}
          onFocus={value => {
            focused = value
          }}
        />
      )
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <SelectKeepAliveWindowHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(60)
    h.stdin.write('\u001B[B')
    await h.wait(10)
    h.stdin.write('\u001B[B')
    await h.wait(10)

    expect(focused).toBe('gamma')

    h.clearOutput()
    await h.wait(80)

    const output = h.getOutput()
    expect(focused).toBe('gamma')
    expect(output).toContain('Alpha')
    expect(output).toContain('Gamma')
    expect(output).not.toContain('Delta')
  })

  test('KeypressProvider: priority can fall back to default on rerender', async () => {
    const handledBy: string[] = []

    function PriorityFallbackHarness(): React.ReactNode {
      const [isElevated, setIsElevated] = useState(true)

      useEffect(() => {
        const timer = setTimeout(() => setIsElevated(false), 50)
        return () => clearTimeout(timer)
      }, [])

      useKeypress(
        input => {
          if (input !== 'x') return
          handledBy.push('dynamic')
          return true
        },
        { priority: isElevated ? 50 : undefined },
      )

      useKeypress(
        input => {
          if (input !== 'x') return
          handledBy.push('fallback')
          return true
        },
        { priority: 0 },
      )

      return <Text>{isElevated ? 'elevated' : 'default'}</Text>
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <PriorityFallbackHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('x')
    await h.wait(25)

    expect(handledBy).toEqual(['dynamic'])

    await h.wait(80)
    expect(h.getOutput()).toContain('default')

    h.stdin.write('x')
    await h.wait(25)

    expect(handledBy).toEqual(['dynamic', 'fallback'])
  })

  test('KeypressProvider: mouse priority can fall back to default on rerender', async () => {
    const handledBy: string[] = []

    function MousePriorityFallbackHarness(): React.ReactNode {
      const [isElevated, setIsElevated] = useState(true)

      useEffect(() => {
        const timer = setTimeout(() => setIsElevated(false), 50)
        return () => clearTimeout(timer)
      }, [])

      useMouse(
        event => {
          if (event.type !== 'press') return
          handledBy.push('dynamic')
          return true
        },
        { priority: isElevated ? 50 : undefined },
      )

      useMouse(
        event => {
          if (event.type !== 'press') return
          handledBy.push('fallback')
          return true
        },
        { priority: 0 },
      )

      return <Text>{isElevated ? 'elevated' : 'default'}</Text>
    }

    const h = createInkTestHarness(
      <KeypressProvider>
        <MousePriorityFallbackHarness />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.stdin.write('\x1b[<0;1;1M')
    await h.wait(25)

    expect(handledBy).toEqual(['dynamic'])

    await h.wait(80)
    expect(h.getOutput()).toContain('default')

    h.stdin.write('\x1b[<0;1;1M')
    await h.wait(25)

    expect(handledBy).toEqual(['dynamic', 'fallback'])
  })

  test('Bash overlay: ctrl+b triggers background callback', async () => {
    let backgrounded = false
    const h = createInkTestHarness(
      <BashToolRunInBackgroundOverlay
        onBackground={() => {
          backgrounded = true
        }}
      />,
    )
    harnessManager.track(h)

    await h.wait(25)

    h.stdin.write('\x02')
    await h.wait(25)

    expect(backgrounded).toBe(true)
  })

  test('queued Waiting… progress is replaced by Running… for same tool_use_id', async () => {
    const toolUseId = 't2'
    const siblings = new Set<string>(['t1', toolUseId])

    const waiting = createProgressMessage(
      toolUseId,
      siblings,
      createAssistantMessage('<tool-progress>Waiting…</tool-progress>'),
      [],
      [],
    )

    const running = createProgressMessage(
      toolUseId,
      siblings,
      createAssistantMessage('<tool-progress>Running…</tool-progress>'),
      [],
      [],
    )

    function MessagesHarness({
      messages,
    }: {
      messages: KodeMessage[]
    }): React.ReactNode {
      const normalized = useMemo(() => normalizeMessages(messages), [messages])
      const ordered = useMemo(() => reorderMessages(normalized), [normalized])

      return (
        <Box flexDirection="column">
          {ordered.map(msg => {
            if (msg.type === 'progress') {
              return (
                <React.Fragment key={msg.uuid}>
                  <MessageResponse
                    children={
                      <Message
                        message={msg.content}
                        messages={msg.normalizedMessages}
                        addMargin={false}
                        tools={msg.tools}
                        verbose={false}
                        debug={false}
                        erroredToolUseIDs={new Set()}
                        inProgressToolUseIDs={new Set()}
                        unresolvedToolUseIDs={new Set()}
                        shouldAnimate={false}
                        shouldShowDot={false}
                      />
                    }
                  />
                </React.Fragment>
              )
            }

            if (msg.type !== 'user' && msg.type !== 'assistant') return null

            return (
              <React.Fragment key={msg.uuid}>
                <Message
                  message={msg}
                  messages={normalized}
                  addMargin={true}
                  tools={[]}
                  verbose={false}
                  debug={false}
                  erroredToolUseIDs={new Set()}
                  inProgressToolUseIDs={new Set()}
                  unresolvedToolUseIDs={new Set()}
                  shouldAnimate={false}
                  shouldShowDot={false}
                />
              </React.Fragment>
            )
          })}
        </Box>
      )
    }

    function AutoUpdateMessagesHarness(): React.ReactNode {
      const [messages, setMessages] = useState<KodeMessage[]>([waiting])

      React.useEffect(() => {
        const handle = setTimeout(() => {
          setMessages([waiting, running])
        }, 60)
        return () => clearTimeout(handle)
      }, [])

      return <MessagesHarness messages={messages} />
    }

    const h = createInkTestHarness(<AutoUpdateMessagesHarness />)
    harnessManager.track(h)

    await h.wait(40)
    expect(h.getOutput()).toContain('Waiting…')

    h.clearOutput()
    await h.wait(90)

    expect(h.getOutput()).toContain('Running…')
    expect(h.getOutput()).not.toContain('Waiting…')
  })
})
