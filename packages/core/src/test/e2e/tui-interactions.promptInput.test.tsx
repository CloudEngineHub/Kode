import { afterEach, describe, expect, test } from 'bun:test'
import React, { useState } from 'react'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Box, Text } from 'ink'
import PromptInput from '#ui-ink/components/PromptInput'
import { PermissionProvider } from '#ui-ink/context/PermissionContext'
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
  const [mode, setMode] = useState<'bash' | 'prompt' | 'koding'>('prompt')
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
})
