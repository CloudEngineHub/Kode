import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { processUserInput } from '@utils/messages'
import { setCwd, getCwd, setOriginalCwd } from '@utils/state'
import { BashTool } from '@tools/BashTool/BashTool'

function extractText(messages: any[]): string {
  const assistant = messages[1]
  if (!assistant) return ''
  const content = assistant.message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text ?? '')
      .join('')
  }
  return ''
}

describe('bash mode cd trailing space handling', () => {
  const runnerCwd = process.cwd()
  let projectDir: string

  beforeEach(async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'kode-cd-space-test-'))
    mkdirSync(join(projectDir, 'foo'), { recursive: true })
    await setCwd(projectDir)
    setOriginalCwd(projectDir)
  })

  afterEach(async () => {
    await setCwd(runnerCwd)
    setOriginalCwd(runnerCwd)
    rmSync(projectDir, { recursive: true, force: true })
  })

  const mockContext = {
    abortController: new AbortController(),
    messageId: 'test',
    readFileTimestamps: {},
    options: {
      commands: [],
      tools: [],
      verbose: false,
      safeMode: false,
      forkNumber: 0,
      messageLogName: 'test',
      maxThinkingTokens: 0,
    },
    setForkConvoWithMessagesOnTheNextRender: () => {},
  } as any

  test('cd with trailing space resolves without space in path', async () => {
    const messages = await processUserInput(
      'cd foo ',
      'bash',
      () => {},
      mockContext,
      null,
    )

    expect(messages).toHaveLength(2)
    const text = extractText(messages)
    expect(text).toContain('Changed directory to')
    expect(text).not.toContain('foo ')
    expect(getCwd()).toBe(join(projectDir, 'foo'))
  })

  test('cd with multiple trailing spaces resolves correctly', async () => {
    const messages = await processUserInput(
      'cd foo   ',
      'bash',
      () => {},
      mockContext,
      null,
    )

    expect(messages).toHaveLength(2)
    const text = extractText(messages)
    expect(text).toContain('Changed directory to')
    expect(getCwd()).toBe(join(projectDir, 'foo'))
  })

  test('cd without trailing space still works', async () => {
    const messages = await processUserInput(
      'cd foo',
      'bash',
      () => {},
      mockContext,
      null,
    )

    expect(messages).toHaveLength(2)
    const text = extractText(messages)
    expect(text).toContain('Changed directory to')
    expect(getCwd()).toBe(join(projectDir, 'foo'))
  })

  test('cd to nonexistent dir shows error without trailing space in path', async () => {
    const messages = await processUserInput(
      'cd bar ',
      'bash',
      () => {},
      mockContext,
      null,
    )

    expect(messages).toHaveLength(2)
    const text = extractText(messages)
    expect(text).toContain('cwd error:')
    expect(text).toContain('does not exist')
    expect(text).not.toContain('bar ')
  })
})

describe('BashTool.validateInput cd trailing space handling', () => {
  test('cd with trailing space passes validation for agent call', async () => {
    const result = await BashTool.validateInput!(
      { command: 'cd foo ' } as any,
      undefined,
    )
    expect(result.result).toBe(true)
  })

  test('cd with multiple trailing spaces passes validation', async () => {
    const result = await BashTool.validateInput!(
      { command: 'cd foo   ' } as any,
      undefined,
    )
    expect(result.result).toBe(true)
  })

  test('cd without trailing space passes validation', async () => {
    const result = await BashTool.validateInput!(
      { command: 'cd foo' } as any,
      undefined,
    )
    expect(result.result).toBe(true)
  })
})
