import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { LspTool } from '#tools/tools/system/LspTool/LspTool'
import { setCwd } from '#core/utils/state'
import type { ToolUseContext } from '#core/tooling/Tool'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function getSingleResultData(events: unknown[]): Record<string, unknown> {
  const first = asRecord(events[0])
  if (!first || first.type !== 'result') {
    throw new Error('Expected a single result event')
  }
  const data = asRecord(first.data)
  if (!data) throw new Error('Expected result event data')
  return data
}

function makeContext(): ToolUseContext {
  return {
    abortController: new AbortController(),
    messageId: 'm1',
    readFileTimestamps: {},
    options: {
      tools: [],
      commands: [],
      forkNumber: 0,
      messageLogName: 'test',
      verbose: false,
      safeMode: true,
      maxThinkingTokens: 0,
    },
  }
}

describe('LSP tool (compat-aligned)', () => {
  let tempDir: string
  let filePath: string

  beforeEach(async () => {
    await setCwd(process.cwd())
    tempDir = mkdtempSync(join(tmpdir(), 'kode-lsp-'))
    filePath = join(tempDir, 'sample.ts')
    writeFileSync(
      filePath,
      [
        'export function foo() { return 1 }',
        'export function bar() { return foo() }',
        'foo()',
        '',
      ].join('\n'),
      'utf8',
    )
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('schema accepts official operations and requires 1-based line/character', () => {
    const base = { filePath: 'x.ts', line: 1, character: 1 as number }
    const ops = [
      'goToDefinition',
      'findReferences',
      'hover',
      'documentSymbol',
      'workspaceSymbol',
      'goToImplementation',
      'prepareCallHierarchy',
      'incomingCalls',
      'outgoingCalls',
    ] as const

    for (const operation of ops) {
      const ok = LspTool.inputSchema.safeParse({ operation, ...base })
      expect(ok.success).toBe(true)
    }

    expect(
      LspTool.inputSchema.safeParse({
        operation: 'goToDefinition',
        filePath: 'x.ts',
        line: 0,
        character: 1,
      }).success,
    ).toBe(false)

    expect(
      LspTool.inputSchema.safeParse({
        operation: 'goToDefinition',
        filePath: 'x.ts',
        line: 1,
        character: 0,
      }).success,
    ).toBe(false)
  })

  test('isEnabled is false when no LSP servers are configured', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'kode-lsp-empty-'))
    try {
      await setCwd(emptyDir)
      expect(await LspTool.isEnabled()).toBe(false)
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  test('goToDefinition returns no-server message when no servers configured', async () => {
    const ctx = makeContext()
    const input = {
      operation: 'goToDefinition',
      filePath,
      line: 2,
      character: 32,
    } as const

    const events: unknown[] = []
    for await (const evt of LspTool.call(input, ctx)) events.push(evt)
    expect(events).toHaveLength(1)

    const out = getSingleResultData(events)
    expect(out.operation).toBe('goToDefinition')
    expect(String(out.result ?? '')).toContain(
      'No LSP server available for file type: .ts',
    )
  })
})
