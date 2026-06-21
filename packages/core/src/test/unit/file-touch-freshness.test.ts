import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ToolUseContext } from '#core/tooling/Tool'
import { setCwd } from '#core/utils/state'
import { FileEditTool } from '#tools/tools/filesystem/FileEditTool/FileEditTool'
import { FileReadTool } from '#tools/tools/filesystem/FileReadTool/FileReadTool'
import { FileWriteTool } from '#tools/tools/filesystem/FileWriteTool/FileWriteTool'

async function drain(gen: AsyncGenerator<unknown>): Promise<void> {
  for await (const _ of gen) {
    // drain
  }
}

function makeToolUseContext(): ToolUseContext {
  return {
    abortController: new AbortController(),
    messageId: 'test',
    options: {
      commands: [],
      tools: [],
      verbose: false,
      safeMode: false,
      forkNumber: 0,
      messageLogName: 'test',
      maxThinkingTokens: 0,
    },
    readFileTimestamps: {},
    readFileHashes: {},
  }
}

describe('File freshness: touched files without content changes', () => {
  const runnerCwd = process.cwd()
  let projectDir: string

  beforeEach(async () => {
    projectDir = mkdtempSync(join(tmpdir(), 'kode-file-touch-'))
    await setCwd(projectDir)
  })

  afterEach(async () => {
    await setCwd(runnerCwd)
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('FileWriteTool does not false-positive when mtime changes but content is unchanged', async () => {
    const ctx = makeToolUseContext()
    const filePath = join(projectDir, 'a.txt')
    writeFileSync(filePath, 'hello\n', 'utf8')

    await drain(FileReadTool.call({ file_path: filePath }, ctx))
    expect(ctx.readFileTimestamps[filePath]).toBeTruthy()
    expect(ctx.readFileHashes?.[filePath]).toBeTruthy()

    const now = new Date()
    utimesSync(filePath, now, new Date(now.getTime() + 10_000))

    const validation = await FileWriteTool.validateInput(
      { file_path: filePath, content: 'ignored' } as never,
      ctx,
    )
    expect(validation).toEqual({ result: true })

    await drain(
      FileWriteTool.call(
        { file_path: filePath, content: 'hello world\n' },
        ctx,
      ),
    )
  })

  test('FileEditTool does not false-positive when mtime changes but content is unchanged', async () => {
    const ctx = makeToolUseContext()
    const filePath = join(projectDir, 'b.txt')
    writeFileSync(filePath, 'abc\n', 'utf8')

    await drain(FileReadTool.call({ file_path: filePath }, ctx))
    expect(ctx.readFileTimestamps[filePath]).toBeTruthy()
    expect(ctx.readFileHashes?.[filePath]).toBeTruthy()

    const now = new Date()
    utimesSync(filePath, now, new Date(now.getTime() + 10_000))

    const validation = await FileEditTool.validateInput(
      {
        file_path: filePath,
        old_string: 'abc',
        new_string: 'abd',
        replace_all: false,
      } as never,
      ctx,
    )
    expect(validation).toEqual({ result: true })

    await drain(
      FileEditTool.call(
        {
          file_path: filePath,
          old_string: 'abc',
          new_string: 'abd',
          replace_all: false,
        } as never,
        ctx,
      ),
    )
  })
})
