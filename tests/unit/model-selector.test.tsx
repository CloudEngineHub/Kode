import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test'
import React, { useState } from 'react'
import { PassThrough } from 'stream'
import stripAnsi from 'strip-ansi'
import { Box, Text, render } from 'ink'
import { buildModelOptions } from '@components/model-selector/filterModels'
import { ModelSelectionScreen } from '@components/model-selector/ModelSelectionScreen'
import { ModelListManager } from '@components/ModelListManager'
import { getTheme } from '@utils/theme'
import { getGlobalConfig, saveGlobalConfig } from '@utils/config'
import { getModelManager, reloadModelManager } from '@utils/model'

type InkTestHarness = {
  stdin: PassThrough & {
    isTTY?: boolean
    setRawMode?: (enabled: boolean) => void
    isRaw?: boolean
  }
  unmount: () => void
  clearOutput: () => void
  getOutput: () => string
  wait: (ms: number) => Promise<void>
}

function createInkTestHarness(element: React.ReactElement): InkTestHarness {
  const stdin = new PassThrough()
  ;(stdin as any).isTTY = true
  ;(stdin as any).isRaw = true
  ;(stdin as any).setRawMode = () => {}
  ;(stdin as any).ref = () => {}
  ;(stdin as any).unref = () => {}
  stdin.setEncoding('utf8')
  stdin.resume()

  const stdout = new PassThrough()
  ;(stdout as any).isTTY = true
  ;(stdout as any).columns = 100
  ;(stdout as any).rows = 30

  let rawOutput = ''
  stdout.on('data', chunk => {
    rawOutput += chunk.toString('utf8')
  })

  const instance = render(element, {
    stdin: stdin as any,
    stdout: stdout as any,
    exitOnCtrlC: false,
    debug: true,
  })

  return {
    stdin,
    unmount: () => instance.unmount(),
    clearOutput: () => {
      rawOutput = ''
    },
    getOutput: () => stripAnsi(rawOutput),
    wait: async ms => new Promise(resolve => setTimeout(resolve, ms)),
  }
}

const mounted: InkTestHarness[] = []
const originalNodeEnv = process.env.NODE_ENV

function configureModelProfiles(modelProfiles: any[]) {
  const firstModelName = modelProfiles[0]?.modelName || ''
  saveGlobalConfig({
    ...(getGlobalConfig() as any),
    modelProfiles,
    modelPointers: {
      main: firstModelName,
      task: firstModelName,
      compact: firstModelName,
      quick: firstModelName,
    },
    defaultModelName: firstModelName,
  } as any)
  reloadModelManager()
}

function makeModelProfile(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Model A',
    provider: 'openai',
    modelName: 'model-a',
    baseURL: 'https://example.com/v1',
    apiKey: 'test-key',
    maxTokens: 1024,
    contextLength: 300000,
    isActive: true,
    createdAt: 1,
    ...overrides,
  }
}

beforeAll(() => {
  process.env.NODE_ENV = 'test'
})

afterEach(() => {
  while (mounted.length > 0) {
    try {
      mounted.pop()!.unmount()
    } catch {}
  }
  configureModelProfiles([])
})

afterAll(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV
    return
  }
  process.env.NODE_ENV = originalNodeEnv
})

describe('ModelSelector modularization', () => {
  test('buildModelOptions filters models by search query', () => {
    const options = buildModelOptions(
      [
        { model: 'gpt-5', provider: 'openai' },
        { model: 'foo', provider: 'custom' },
      ] as any,
      'gpt',
    )
    expect(options.map(o => o.value)).toEqual(['gpt-5'])
  })

  test('ModelSelectionScreen filters and calls onModelSelect', async () => {
    const theme = getTheme()
    const models = [
      { model: 'gpt-5', provider: 'openai' },
      { model: 'foo', provider: 'custom' },
    ] as any

    function Harness(): React.ReactNode {
      const [selected, setSelected] = useState('')
      const [query, setQuery] = useState('')
      const [cursorOffset, setCursorOffset] = useState(0)

      return (
        <Box flexDirection="column">
          <Text>SELECTED:{selected}</Text>
          <ModelSelectionScreen
            theme={theme}
            exitState={{ pending: false, keyName: 'Ctrl-C' }}
            providerLabel="Test Provider"
            modelTypeText="this model profile"
            availableModels={models}
            modelSearchQuery={query}
            onModelSearchChange={setQuery}
            modelSearchCursorOffset={cursorOffset}
            onModelSearchCursorOffsetChange={setCursorOffset}
            onModelSelect={setSelected}
          />
        </Box>
      )
    }

    const h = createInkTestHarness(<Harness />)
    mounted.push(h)

    await h.wait(100)
    expect(h.getOutput()).toContain('Showing 2 of 2 models')

    h.clearOutput()
    h.stdin.write('foo')
    await h.wait(50)
    expect(h.getOutput()).toContain('Showing 1 of 2 models')

    h.clearOutput()
    h.stdin.write('\r')
    await h.wait(50)
    expect(h.getOutput()).toContain('SELECTED:foo')
  })

  test('ModelListManager can delete the only configured model', async () => {
    configureModelProfiles([makeModelProfile()])

    const h = createInkTestHarness(<ModelListManager onClose={() => {}} />)
    mounted.push(h)

    await h.wait(100)
    h.stdin.write('\u001B[B')
    await h.wait(20)
    h.stdin.write('d')
    await h.wait(20)

    expect(h.getOutput()).toContain('DELETE MODE')

    h.stdin.write('\r')
    await h.wait(50)

    expect(getModelManager().getAllConfiguredModels()).toEqual([])
    expect(getGlobalConfig().modelPointers).toEqual({
      main: '',
      task: '',
      compact: '',
      quick: '',
    })
  })

  test('ModelListManager opens existing model in edit mode', async () => {
    configureModelProfiles([makeModelProfile()])

    const h = createInkTestHarness(<ModelListManager onClose={() => {}} />)
    mounted.push(h)

    await h.wait(100)
    h.stdin.write('\u001B[B')
    await h.wait(20)
    h.stdin.write('\r')
    await h.wait(50)

    expect(h.getOutput()).toContain('Model Parameters')
    expect(h.getOutput()).toContain('Configure parameters for model-a')
    expect(h.getOutput()).toContain('1K tokens')
  })
})
