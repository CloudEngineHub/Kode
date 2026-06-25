import { afterEach, describe, expect, test } from 'bun:test'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __loadCommandsFromPathForTests } from './useSystemCommands'

const tmpDirs: string[] = []

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map(dir => rm(dir, { recursive: true })))
})

describe('loadCommandsFromPath', () => {
  test('loads essential commands and executable PATH entries asynchronously', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kode-commands-'))
    tmpDirs.push(dir)

    const commandName =
      process.platform === 'win32'
        ? 'kode-test-command.cmd'
        : 'kode-test-command'
    const commandPath = join(dir, commandName)
    await writeFile(commandPath, '#!/bin/sh\necho ok\n', 'utf8')
    if (process.platform !== 'win32') {
      await chmod(commandPath, 0o755)
    }

    const commands = await __loadCommandsFromPathForTests(dir)

    expect(commands).toContain('git')
    expect(commands).toContain(commandName)
  })
})
