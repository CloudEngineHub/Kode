import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  __setExternalEditorDependencyLoaderForTests,
  launchExternalEditor,
  launchExternalEditorForFilePath,
  type ExternalEditorDependencies,
} from './externalEditor'

const lifecycle: string[] = []

let exitCode: number | null = 0
let fakeStdin: FakeTTYInput

const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin')
const originalStdout = Object.getOwnPropertyDescriptor(process, 'stdout')
const originalEditor = process.env.EDITOR
const originalVisual = process.env.VISUAL
const originalScreenReader = process.env.SCREENREADER
const originalKodeScreenReader = process.env.KODE_SCREEN_READER

class FakeTTYInput {
  isTTY = true
  isRaw: boolean

  constructor(isRaw: boolean) {
    this.isRaw = isRaw
  }

  pause(): void {
    lifecycle.push('stdin.pause')
  }

  resume(): void {
    lifecycle.push('stdin.resume')
  }

  setRawMode(value: boolean): void {
    this.isRaw = value
    lifecycle.push(`stdin.raw:${value}`)
  }
}

function installFakeTty({ isRaw = true }: { isRaw?: boolean } = {}): void {
  fakeStdin = new FakeTTYInput(isRaw)
  Object.defineProperty(process, 'stdin', {
    configurable: true,
    value: fakeStdin,
  })
  Object.defineProperty(process, 'stdout', {
    configurable: true,
    value: { isTTY: true },
  })
}

function restoreProcessState(): void {
  if (originalStdin) Object.defineProperty(process, 'stdin', originalStdin)
  if (originalStdout) Object.defineProperty(process, 'stdout', originalStdout)
  if (originalEditor === undefined) delete process.env.EDITOR
  else process.env.EDITOR = originalEditor
  if (originalVisual === undefined) delete process.env.VISUAL
  else process.env.VISUAL = originalVisual
  if (originalScreenReader === undefined) delete process.env.SCREENREADER
  else process.env.SCREENREADER = originalScreenReader
  if (originalKodeScreenReader === undefined)
    delete process.env.KODE_SCREEN_READER
  else process.env.KODE_SCREEN_READER = originalKodeScreenReader
}

function createFakeDependencies(): ExternalEditorDependencies {
  const dependencies = {
    spawnSync: () => ({ status: 0 }),
    spawn: (command: string, args: string[]) => {
      lifecycle.push(`spawn:${command}`)
      lifecycle.push(`spawn.raw:${fakeStdin?.isRaw ?? false}`)
      lifecycle.push(`spawn.file:${args.at(-1) ?? ''}`)

      const child = new EventEmitter()
      queueMicrotask(() => child.emit('exit', exitCode, null))
      return child
    },
    writeToStdout: (chunk: Uint8Array | string, callback?: () => void) => {
      lifecycle.push(`stdout:${String(chunk)}`)
      callback?.()
      return true
    },
    enableLineWrapping: () => lifecycle.push('lineWrapping.enable'),
    disableLineWrapping: () => lifecycle.push('lineWrapping.disable'),
    suspendMouseEvents: () => lifecycle.push('mouse.suspend'),
    resumeMouseEvents: () => lifecycle.push('mouse.resume'),
    withEphemeralAlternateScreen: async <T>(fn: () => Promise<T> | T) => {
      lifecycle.push('alternateScreen.enter')
      try {
        return await fn()
      } finally {
        lifecycle.push('alternateScreen.exit')
      }
    },
    getInkInstanceForStdout: () => ({
      pause: () => lifecycle.push('ink.pause'),
      resume: () => lifecycle.push('ink.resume'),
      suspendStdin: () => lifecycle.push('ink.suspendStdin'),
      resumeStdin: () => lifecycle.push('ink.resumeStdin'),
    }),
    terminalCapabilityManager: {
      disableAllModes: () => lifecycle.push('terminalModes.disable'),
      enableSupportedModes: () => lifecycle.push('terminalModes.enable'),
    },
  }

  return dependencies as unknown as ExternalEditorDependencies
}

beforeEach(() => {
  lifecycle.length = 0
  exitCode = 0
  installFakeTty({ isRaw: true })
  process.env.EDITOR = 'test-editor'
  delete process.env.VISUAL
  delete process.env.SCREENREADER
  delete process.env.KODE_SCREEN_READER
  __setExternalEditorDependencyLoaderForTests(createFakeDependencies)
})

afterEach(() => {
  exitCode = 0
  __setExternalEditorDependencyLoaderForTests(null)
})

afterAll(() => {
  restoreProcessState()
})

describe('external editor terminal suspension', () => {
  test('launchExternalEditor owns Ink and terminal mode restore around the child editor', async () => {
    const result = await launchExternalEditor('draft')

    expect(result).toEqual({
      text: 'draft',
      editorLabel: 'test-editor',
    })
    expect(fakeStdin.isRaw).toBe(true)
    expect(lifecycle).toEqual([
      'stdin.pause',
      'stdin.raw:false',
      'ink.pause',
      'ink.suspendStdin',
      'terminalModes.disable',
      'mouse.suspend',
      'lineWrapping.enable',
      'stdout:\x1b[0m\x1b[?25h',
      'alternateScreen.enter',
      'spawn:test-editor',
      'spawn.raw:false',
      expect.stringMatching(/^spawn\.file:.*message\.txt$/),
      'alternateScreen.exit',
      'stdout:\x1b[?25l',
      'lineWrapping.disable',
      'terminalModes.enable',
      'mouse.resume',
      'ink.resumeStdin',
      'ink.resume',
      'stdin.resume',
      'stdin.raw:true',
    ])
  })

  test('launchExternalEditorForFilePath restores terminal state when editor exits non-zero', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kode-editor-test-'))
    const filePath = join(dir, 'output.txt')
    writeFileSync(filePath, 'content', 'utf8')
    exitCode = 2

    try {
      const result = await launchExternalEditorForFilePath(filePath)

      expect(result.ok).toBe(false)
      expect(fakeStdin.isRaw).toBe(true)
      expect(lifecycle).toContain('terminalModes.disable')
      expect(lifecycle).toContain('terminalModes.enable')
      expect(lifecycle.at(-2)).toBe('stdin.resume')
      expect(lifecycle.at(-1)).toBe('stdin.raw:true')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
