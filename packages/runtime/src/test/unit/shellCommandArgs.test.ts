import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCmdWithArgsForPlatform } from '#runtime/shell/shellCmd'

describe('literal arguments to trusted shell commands', () => {
  test.skipIf(process.platform === 'win32')(
    'POSIX shell parameters preserve empty strings, quotes and expansions',
    () => {
      const args = [
        '',
        'a b',
        "a'b",
        'a"b',
        '$(printf changed)',
        '`printf changed`',
        '$HOME',
        'line\nbreak',
        'a=b',
        'a;false',
      ]
      const spec = getShellCmdWithArgsForPlatform(
        process.platform,
        'printf "%s\\0"',
        args,
      )
      const result = spawnSync(spec.cmd[0], spec.cmd.slice(1), {
        env: spec.env,
      })
      expect(result.status).toBe(0)
      expect(result.stdout.toString().split('\0').slice(0, -1)).toEqual(args)
    },
  )

  test.each(['bad"name', 'bad\nname', 'bad\rname', 'bad\0name'])(
    'Windows rejects arguments that can break its filename quoting boundary: %j',
    arg => {
      expect(() =>
        getShellCmdWithArgsForPlatform('win32', 'editor', [arg], {}),
      ).toThrow('Unsupported character')
    },
  )

  test('Windows selects ComSpec without mutating inherited variables', () => {
    const env = {
      ComSpec: 'C:\\Windows\\System32\\cmd.exe',
      __KODE_SHELL_ARG_0: 'inherited',
    }
    const spec = getShellCmdWithArgsForPlatform(
      'win32',
      'editor',
      ['literal & %PATH% !x!.txt'],
      env,
    )
    expect(spec.cmd.slice(0, 5)).toEqual([
      env.ComSpec,
      '/d',
      '/v:off',
      '/s',
      '/c',
    ])
    expect(spec.env.__KODE_SHELL_ARG_0).toBe('literal & %PATH% !x!.txt')
    expect(env.__KODE_SHELL_ARG_0).toBe('inherited')
  })

  test.skipIf(process.platform !== 'win32')(
    'Windows start preserves literal arguments after its empty title',
    () => {
      const root = mkdtempSync(join(tmpdir(), 'kode-start-'))
      try {
        const script = join(root, 'record.js')
        const log = join(root, 'args.json')
        writeFileSync(
          script,
          "require('fs').writeFileSync(process.env.KODE_TEST_ARGS,JSON.stringify(process.argv.slice(2)))",
        )
        const arg = join(root, 'literal %PATH% !bang! ^ & (x).txt')
        const spec = getShellCmdWithArgsForPlatform(
          'win32',
          `start "" /b /wait "${process.execPath}" "${script}"`,
          [arg],
        )
        const result = spawnSync(spec.cmd[0], spec.cmd.slice(1), {
          env: { ...spec.env, KODE_TEST_ARGS: log },
          windowsVerbatimArguments: spec.windowsVerbatimArguments,
          timeout: 5000,
        })
        expect(result.status).toBe(0)
        expect(JSON.parse(readFileSync(log, 'utf8'))).toEqual([arg])
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
