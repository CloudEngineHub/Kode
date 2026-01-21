import { afterEach, describe, expect, test } from 'bun:test'
import React, { useState } from 'react'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Box, Text } from 'ink'
import PromptInput from '#ui-ink/components/PromptInput'
import type { PromptMode } from '#ui-ink/components/PromptInput/types'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { PermissionProvider } from '#ui-ink/contexts/PermissionContext'
import { useCancelRequest } from '#ui-ink/hooks/useCancelRequest'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { setCwd } from '#core/utils/state'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

function PromptInputHarness({
  conversationKey,
  showRaw = false,
}: {
  conversationKey: string
  showRaw?: boolean
}): React.ReactNode {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<PromptMode>('prompt')
  const [submitCount, setSubmitCount] = useState(0)
  const [abortController, setAbortController] =
    useState<AbortController | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const prompt = (
    <PromptInput
      commands={[]}
      forkNumber={0}
      messageLogName="tui"
      isDisabled={false}
      isLoading={isLoading}
      onQuery={async () => {}}
      debug={false}
      verbose={false}
      messages={[]}
      setToolJSX={() => {}}
      tools={[]}
      input={input}
      onInputChange={setInput}
      mode={mode}
      onModeChange={setMode}
      submitCount={submitCount}
      onSubmitCountChange={updater => setSubmitCount(prev => updater(prev))}
      setIsLoading={setIsLoading}
      setAbortController={setAbortController}
      onShowMessageSelector={() => {}}
      setForkConvoWithMessagesOnTheNextRender={() => {}}
      readFileTimestamps={{}}
      abortController={abortController}
    />
  )

  return (
    <KeypressProvider>
      <PermissionProvider
        conversationKey={conversationKey}
        isBypassPermissionsModeAvailable={true}
      >
        {showRaw ? (
          <Box flexDirection="column">
            <Text>RAW:{JSON.stringify(input)}</Text>
            {prompt}
          </Box>
        ) : (
          prompt
        )}
      </PermissionProvider>
    </KeypressProvider>
  )
}

function PromptInputCancelHarness({
  conversationKey,
  initialIsLoading,
}: {
  conversationKey: string
  initialIsLoading: boolean
}): React.ReactNode {
  return (
    <KeypressProvider>
      <PermissionProvider
        conversationKey={conversationKey}
        isBypassPermissionsModeAvailable={true}
      >
        <PromptInputCancelHarnessInner initialIsLoading={initialIsLoading} />
      </PermissionProvider>
    </KeypressProvider>
  )
}

function PromptInputCancelHarnessInner({
  initialIsLoading,
}: {
  initialIsLoading: boolean
}): React.ReactNode {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<PromptMode>('prompt')
  const [submitCount, setSubmitCount] = useState(0)
  const [abortController, setAbortController] =
    useState<AbortController | null>(() => new AbortController())
  const [isLoading, setIsLoading] = useState(initialIsLoading)
  const [cancelled, setCancelled] = useState(false)

  useCancelRequest(
    () => {},
    () => {},
    () => {},
    () => {
      abortController?.abort()
      setCancelled(true)
      setIsLoading(false)
    },
    isLoading,
    false,
    abortController?.signal,
  )

  return (
    <Box flexDirection="column">
      <Text>RAW:{JSON.stringify(input)}</Text>
      <Text>LOADING:{String(isLoading)}</Text>
      <Text>ABORTED:{String(abortController?.signal.aborted ?? false)}</Text>
      <Text>CANCELLED:{String(cancelled)}</Text>
      <PromptInput
        commands={[]}
        forkNumber={0}
        messageLogName="tui"
        isDisabled={false}
        isLoading={isLoading}
        onQuery={async () => {}}
        debug={false}
        verbose={false}
        messages={[]}
        setToolJSX={() => {}}
        tools={[]}
        input={input}
        onInputChange={setInput}
        mode={mode}
        onModeChange={setMode}
        submitCount={submitCount}
        onSubmitCountChange={updater => setSubmitCount(prev => updater(prev))}
        setIsLoading={setIsLoading}
        setAbortController={setAbortController}
        onShowMessageSelector={() => {}}
        setForkConvoWithMessagesOnTheNextRender={() => {}}
        readFileTimestamps={{}}
        abortController={abortController}
      />
    </Box>
  )
}

function DraftPastePersistenceHarness({
  conversationKey,
}: {
  conversationKey: string
}): React.ReactNode {
  return (
    <KeypressProvider>
      <PermissionProvider
        conversationKey={conversationKey}
        isBypassPermissionsModeAvailable={true}
      >
        <DraftPastePersistenceHarnessInner />
      </PermissionProvider>
    </KeypressProvider>
  )
}

function DraftPastePersistenceHarnessInner(): React.ReactNode {
  const [input, setInput] = useState('hello [Pasted text #1] world')
  const [mode, setMode] = useState<PromptMode>('prompt')
  const [submitCount, setSubmitCount] = useState(0)
  const [abortController, setAbortController] =
    useState<AbortController | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPrompt, setShowPrompt] = useState(true)
  const [draftPastes, setDraftPastes] = useState<{
    pastedTexts: Array<{ placeholder: string; text: string }>
    pastedImages: Array<{
      placeholder: string
      data: string
      mediaType: string
    }>
  }>({
    pastedTexts: [{ placeholder: '[Pasted text #1]', text: 'PASTE' }],
    pastedImages: [],
  })
  const [submittedText, setSubmittedText] = useState<string>('')

  useKeypress(
    (inputChar, key) => {
      if (key.ctrl && inputChar === 'g') {
        setShowPrompt(prev => !prev)
        return true
      }
    },
    { priority: 50 },
  )

  return (
    <Box flexDirection="column">
      <Text>SUB:{JSON.stringify(submittedText)}</Text>
      <Text>DRAFT:{JSON.stringify(draftPastes)}</Text>
      {showPrompt ? (
        <PromptInput
          commands={[]}
          forkNumber={0}
          messageLogName="tui"
          isDisabled={false}
          isLoading={isLoading}
          onQuery={async newMessages => {
            const lastUser = [...newMessages]
              .reverse()
              .find(m => m.type === 'user') as any
            const content = lastUser?.message?.content
            const text =
              typeof content === 'string'
                ? content
                : Array.isArray(content)
                  ? content
                      .map(block =>
                        typeof block === 'string'
                          ? block
                          : typeof (block as any)?.text === 'string'
                            ? (block as any).text
                            : '',
                      )
                      .join('')
                  : ''

            setSubmittedText(text)
            setIsLoading(false)
            setAbortController(null)
          }}
          debug={false}
          verbose={false}
          messages={[]}
          setToolJSX={() => {}}
          tools={[]}
          input={input}
          onInputChange={setInput}
          mode={mode}
          onModeChange={setMode}
          submitCount={submitCount}
          onSubmitCountChange={updater => setSubmitCount(prev => updater(prev))}
          setIsLoading={setIsLoading}
          setAbortController={setAbortController}
          onShowMessageSelector={() => {}}
          setForkConvoWithMessagesOnTheNextRender={() => {}}
          readFileTimestamps={{}}
          abortController={abortController}
          draftPastes={draftPastes}
          onDraftPastesChange={setDraftPastes}
        />
      ) : (
        <Text>OVERLAY</Text>
      )}
    </Box>
  )
}

const harnessManager = createInkHarnessManager()

afterEach(async () => {
  await harnessManager.cleanup()
})

describe('TUI E2E regression (Ink render): PromptInput', () => {
  test('Completion: Space inserts a space (does not accept suggestion)', async () => {
    await setCwd(process.cwd())

    const conversationKey = `tui:${Math.random().toString(16).slice(2)}`
    const h = createInkTestHarness(
      <PromptInputHarness conversationKey={conversationKey} showRaw={true} />,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.clearOutput()

    h.stdin.write('./d')
    await h.wait(75)
    expect(h.getOutput()).toContain('RAW:\"./d\"')

    h.clearOutput()
    h.stdin.write(' ')
    await h.wait(75)

    const out = h.getOutput()
    expect(out).toContain('RAW:\"./d \"')
    expect(out).not.toContain('RAW:\"./dist/')
    expect(out).not.toContain('RAW:\"loading...')
  })

  test('shift+tab cycles permission mode and renders CompactModeIndicator', async () => {
    const conversationKey = `tui:${Math.random().toString(16).slice(2)}`
    const h = createInkTestHarness(
      <PromptInputHarness conversationKey={conversationKey} />,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.clearOutput()

    h.stdin.write('\u001B[Z')
    await h.wait(50)

    expect(h.getOutput()).toContain('accept edits on')
    expect(h.getOutput()).toContain('(shift+tab to cycle)')
  })

  test('shift+enter inserts newline (CSI-u)', async () => {
    const conversationKey = `tui:${Math.random().toString(16).slice(2)}`
    const h = createInkTestHarness(
      <PromptInputHarness conversationKey={conversationKey} showRaw={true} />,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.clearOutput()

    h.stdin.write('hello')
    await h.wait(75)
    expect(h.getOutput()).toContain('RAW:\"hello\"')

    h.clearOutput()
    h.stdin.write('\u001b[13;2u')
    await h.wait(75)

    h.stdin.write('world')
    await h.wait(75)

    expect(h.getOutput()).toContain('RAW:\"hello\\nworld\"')
  })

  test('shift+enter inserts newline (CSI-tilde)', async () => {
    const conversationKey = `tui:${Math.random().toString(16).slice(2)}`
    const h = createInkTestHarness(
      <PromptInputHarness conversationKey={conversationKey} showRaw={true} />,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.clearOutput()

    h.stdin.write('hello')
    await h.wait(75)
    expect(h.getOutput()).toContain('RAW:\"hello\"')

    h.clearOutput()
    h.stdin.write('\u001b[13;2~')
    await h.wait(75)

    h.stdin.write('world')
    await h.wait(75)

    expect(h.getOutput()).toContain('RAW:\"hello\\nworld\"')
  })

  test('statusline renders when configured', async () => {
    const originalHome = process.env.HOME
    const originalUserProfile = process.env.USERPROFILE
    const originalEnabled = process.env.KODE_STATUSLINE_ENABLED
    const originalConfigDir = process.env.KODE_CONFIG_DIR

    const homeDir = mkdtempSync(join(tmpdir(), 'kode-statusline-home-'))
    process.env.HOME = homeDir
    process.env.USERPROFILE = homeDir
    process.env.KODE_STATUSLINE_ENABLED = '1'
    process.env.KODE_CONFIG_DIR = join(homeDir, '.kode')

    mkdirSync(join(homeDir, '.kode'), { recursive: true })
    const cmd = `${process.execPath} -e \"process.stdout.write('hello-statusline')\"`
    writeFileSync(
      join(homeDir, '.kode', 'settings.json'),
      JSON.stringify({ statusLine: cmd }, null, 2) + '\n',
      'utf8',
    )

    try {
      const conversationKey = `tui:${Math.random().toString(16).slice(2)}`
      const h = createInkTestHarness(
        <PromptInputHarness conversationKey={conversationKey} />,
      )
      harnessManager.track(h)

      await h.wait(25)
      await h.wait(1000)

      expect(h.getOutput()).toContain('hello-statusline')
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome

      if (originalUserProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = originalUserProfile

      if (originalEnabled === undefined)
        delete process.env.KODE_STATUSLINE_ENABLED
      else process.env.KODE_STATUSLINE_ENABLED = originalEnabled

      if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
      else process.env.KODE_CONFIG_DIR = originalConfigDir

      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  test('Esc with queued prompt moves queued prompt to input (does not cancel)', async () => {
    const conversationKey = `tui:${Math.random().toString(16).slice(2)}`
    const h = createInkTestHarness(
      <PromptInputCancelHarness
        conversationKey={conversationKey}
        initialIsLoading={true}
      />,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.clearOutput()

    h.stdin.write('hello')
    await h.wait(75)

    h.stdin.write('\r')
    await h.wait(75)

    h.stdin.write('\u001b')
    await h.wait(100)

    const out = h.getOutput()
    expect(out).toContain('RAW:\"hello\"')
    expect(out).toContain('LOADING:true')
    expect(out).toContain('ABORTED:false')
    expect(out).toContain('CANCELLED:false')
  })

  test('Esc cancels running task when no queued prompt exists', async () => {
    const conversationKey = `tui:${Math.random().toString(16).slice(2)}`
    const h = createInkTestHarness(
      <PromptInputCancelHarness
        conversationKey={conversationKey}
        initialIsLoading={true}
      />,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.clearOutput()

    h.stdin.write('\u001b')
    await h.wait(100)

    const out = h.getOutput()
    expect(out).toContain('LOADING:false')
    expect(out).toContain('ABORTED:true')
    expect(out).toContain('CANCELLED:true')
  })

  test('draft pasted content survives unmount/remount (overlay lifecycle)', async () => {
    const conversationKey = `tui:${Math.random().toString(16).slice(2)}`
    const h = createInkTestHarness(
      <DraftPastePersistenceHarness conversationKey={conversationKey} />,
    )
    harnessManager.track(h)

    await h.wait(25)
    h.clearOutput()

    // Hide PromptInput (simulate a fullscreen overlay).
    h.stdin.write('\x07')
    await h.wait(50)
    expect(h.getOutput()).toContain('OVERLAY')

    h.clearOutput()

    // Show PromptInput again.
    h.stdin.write('\x07')
    await h.wait(50)

    // Submit and verify placeholder expansion still has access to pasted content.
    h.stdin.write('\r')
    await h.wait(150)

    const out = h.getOutput()
    expect(out).toContain('SUB:\"hello PASTE world\"')
    expect(out).not.toContain('SUB:\"hello [Pasted text #1] world\"')
  })
})
