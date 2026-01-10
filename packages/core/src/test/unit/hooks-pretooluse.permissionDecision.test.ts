import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { z } from 'zod'
import type { Tool } from '#core/tooling/Tool'
import { runToolUse } from '#core/query'
import { createAssistantMessage } from '#core/utils/messages'
import { setCwd } from '#core/utils/state'
import { __resetKodeHooksCacheForTests } from '#core/utils/kodeHooks'

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

describe('Hooks: PreToolUse command hooks (permissionDecision)', () => {
  const runnerCwd = process.cwd()

  let projectDir: string

  beforeEach(async () => {
    __resetKodeHooksCacheForTests()
    projectDir = mkdtempSync(join(tmpdir(), 'kode-hooks-project-'))
    await setCwd(projectDir)
  })

  afterEach(async () => {
    await setCwd(runnerCwd)
    __resetKodeHooksCacheForTests()
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('JSON permissionDecision deny blocks even with exit code 0', async () => {
    const hookJsonPath = join(projectDir, 'hook-json.js')
    writeFileSync(
      hookJsonPath,
      `
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let data = {};
try { data = JSON.parse(raw); } catch {}
const cmd = data?.tool_input?.command || '';
if (String(cmd).includes('deny')) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny' }, systemMessage: 'DENIED' }));
  process.exit(0);
}
process.exit(0);
`,
      'utf8',
    )

    writeJson(join(projectDir, '.claude', 'settings.json'), {
      hooks: {
        PreToolUse: [
          {
            matcher: 'FakeTool',
            hooks: [{ type: 'command', command: `bun \"${hookJsonPath}\"` }],
          },
        ],
      },
    })

    let called = false
    const fakeTool: Tool<any, any> = {
      name: 'FakeTool',
      inputSchema: z.strictObject({ command: z.string() }),
      async prompt() {
        return ''
      },
      async isEnabled() {
        return true
      },
      isReadOnly() {
        return false
      },
      isConcurrencySafe() {
        return true
      },
      needsPermissions() {
        return false
      },
      renderResultForAssistant() {
        return 'ok'
      },
      renderToolUseMessage() {
        return null
      },
      async *call() {
        called = true
        yield {
          type: 'result' as const,
          data: { ok: true },
          resultForAssistant: 'ok',
        }
      },
    }

    const toolUse: any = {
      type: 'tool_use',
      id: 'toolu_json_deny',
      name: 'FakeTool',
      input: { command: 'deny' },
    }
    const ctx: any = {
      abortController: new AbortController(),
      readFileTimestamps: {},
      setToolJSX() {},
      messageId: 'm1',
      options: {
        tools: [fakeTool],
        commands: [],
        forkNumber: 0,
        messageLogName: 'test',
        verbose: false,
        safeMode: true,
        maxThinkingTokens: 0,
      },
    }

    const messages: any[] = []
    for await (const msg of runToolUse(
      toolUse,
      new Set([toolUse.id]),
      createAssistantMessage(''),
      async () => ({ result: true }),
      ctx,
      false,
    )) {
      messages.push(msg)
    }

    expect(called).toBe(false)
    expect(messages.length).toBe(1)
    expect(messages[0]?.type).toBe('user')
    expect(messages[0]?.message?.content?.[0]?.type).toBe('tool_result')
    expect(messages[0]?.message?.content?.[0]?.is_error).toBe(true)
    expect(String(messages[0]?.message?.content?.[0]?.content)).toContain(
      'DENIED',
    )
  })

  test('JSON permissionDecision allow can update input and bypass permission prompts', async () => {
    const hookJsonPath = join(projectDir, 'hook-json-allow.js')
    writeFileSync(
      hookJsonPath,
      `
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
let data = {};
try { data = JSON.parse(raw); } catch {}
const cmd = data?.tool_input?.command || '';
if (String(cmd).includes('allow')) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'allow', updatedInput: { command: 'modified' } } }));
  process.exit(0);
}
process.exit(0);
`,
      'utf8',
    )

    writeJson(join(projectDir, '.claude', 'settings.json'), {
      hooks: {
        PreToolUse: [
          {
            matcher: 'FakeTool',
            hooks: [{ type: 'command', command: `bun \"${hookJsonPath}\"` }],
          },
        ],
      },
    })

    let calledCommand = ''
    const fakeTool: Tool<any, any> = {
      name: 'FakeTool',
      inputSchema: z.strictObject({ command: z.string() }),
      async prompt() {
        return ''
      },
      async isEnabled() {
        return true
      },
      isReadOnly() {
        return false
      },
      isConcurrencySafe() {
        return true
      },
      needsPermissions() {
        return false
      },
      renderResultForAssistant() {
        return 'ok'
      },
      renderToolUseMessage() {
        return null
      },
      async *call(input: any) {
        calledCommand = String(input?.command ?? '')
        yield {
          type: 'result' as const,
          data: { ok: true },
          resultForAssistant: 'ok',
        }
      },
    }

    const toolUse: any = {
      type: 'tool_use',
      id: 'toolu_json_allow',
      name: 'FakeTool',
      input: { command: 'allow' },
    }
    const ctx: any = {
      abortController: new AbortController(),
      readFileTimestamps: {},
      setToolJSX() {},
      messageId: 'm1',
      options: {
        tools: [fakeTool],
        commands: [],
        forkNumber: 0,
        messageLogName: 'test',
        verbose: false,
        safeMode: true,
        maxThinkingTokens: 0,
      },
    }

    const messages: any[] = []
    for await (const msg of runToolUse(
      toolUse,
      new Set([toolUse.id]),
      createAssistantMessage(''),
      async () => ({ result: false, message: 'DENIED' }),
      ctx,
      false,
    )) {
      messages.push(msg)
    }

    expect(calledCommand).toBe('modified')
    expect(
      messages.some(
        m =>
          m.type === 'user' &&
          Array.isArray(m.message?.content) &&
          m.message.content[0]?.type === 'tool_result' &&
          m.message.content[0]?.is_error !== true,
      ),
    ).toBe(true)
  })
})
