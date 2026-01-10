import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs'
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

describe('LSP tool (TypeScript backend)', () => {
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

  test('isEnabled is false when TypeScript is unavailable in the project cwd', async () => {
    const noTsDir = mkdtempSync(join(tmpdir(), 'kode-lsp-no-ts-'))
    try {
      await setCwd(noTsDir)
      expect(await LspTool.isEnabled()).toBe(false)
    } finally {
      rmSync(noTsDir, { recursive: true, force: true })
    }
  })

  test('goToDefinition returns formatted location + counts', async () => {
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
    expect(String(out.result ?? '')).toContain('Defined in')
    expect(Number(out.resultCount ?? 0)).toBeGreaterThan(0)
    expect(Number(out.fileCount ?? 0)).toBeGreaterThan(0)
  })

  test('findReferences returns formatted grouped locations + counts', async () => {
    const ctx = makeContext()
    const input = {
      operation: 'findReferences',
      filePath,
      line: 2,
      character: 32,
    } as const

    const events: unknown[] = []
    for await (const evt of LspTool.call(input, ctx)) events.push(evt)
    expect(events).toHaveLength(1)

    const out = getSingleResultData(events)
    expect(out.operation).toBe('findReferences')
    expect(String(out.result ?? '')).toContain('references')
    expect(Number(out.resultCount ?? 0)).toBeGreaterThanOrEqual(3)
    expect(Number(out.fileCount ?? 0)).toBeGreaterThanOrEqual(1)
  })

  test('hover returns formatted hover result + counts', async () => {
    const ctx = makeContext()
    const input = {
      operation: 'hover',
      filePath,
      line: 2,
      character: 32,
    } as const

    const events: unknown[] = []
    for await (const evt of LspTool.call(input, ctx)) events.push(evt)
    expect(events).toHaveLength(1)

    const out = getSingleResultData(events)
    expect(out.operation).toBe('hover')
    expect(String(out.result ?? '')).toContain('Hover info')
    expect(Number(out.resultCount ?? 0)).toBe(1)
    expect(Number(out.fileCount ?? 0)).toBe(1)
  })

  test('documentSymbol returns formatted symbol list + counts', async () => {
    const ctx = makeContext()
    const input = {
      operation: 'documentSymbol',
      filePath,
      line: 1,
      character: 1,
    } as const

    const events: unknown[] = []
    for await (const evt of LspTool.call(input, ctx)) events.push(evt)
    expect(events).toHaveLength(1)

    const out = getSingleResultData(events)
    expect(out.operation).toBe('documentSymbol')
    expect(String(out.result ?? '')).toContain('Document symbols:')
    expect(String(out.result ?? '')).toContain('foo')
    expect(String(out.result ?? '')).toContain('bar')
    expect(Number(out.resultCount ?? 0)).toBeGreaterThanOrEqual(2)
    expect(Number(out.fileCount ?? 0)).toBe(1)
  })

  test('documentSymbol reflects on-disk file edits (mtime-based versions)', async () => {
    const ctx = makeContext()
    const input = {
      operation: 'documentSymbol',
      filePath,
      line: 1,
      character: 1,
    } as const

    const events1: unknown[] = []
    for await (const evt of LspTool.call(input, ctx)) events1.push(evt)
    expect(events1).toHaveLength(1)
    const out1 = getSingleResultData(events1)
    expect(String(out1.result ?? '')).toContain('foo')
    expect(String(out1.result ?? '')).not.toContain('baz')

    const beforeMtime = statSync(filePath).mtimeMs
    const updated = [
      'export function foo() { return 1 }',
      'export function bar() { return foo() }',
      'export function baz() { return bar() }',
      'foo()',
      '',
    ].join('\n')
    writeFileSync(filePath, updated, 'utf8')
    // Make mtime changes deterministic for version tracking.
    utimesSync(filePath, new Date(), new Date(beforeMtime + 1000))

    // Confirm the on-disk mtime changed (guard against low-resolution FS).
    expect(statSync(filePath).mtimeMs).toBeGreaterThan(beforeMtime)

    const events2: unknown[] = []
    for await (const evt of LspTool.call(input, ctx)) events2.push(evt)
    expect(events2).toHaveLength(1)
    const out2 = getSingleResultData(events2)
    expect(String(out2.result ?? '')).toContain('baz')
  })
})
