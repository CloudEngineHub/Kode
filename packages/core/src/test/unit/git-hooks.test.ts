import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

describe('pre-commit quality gate', () => {
  test.skipIf(process.platform === 'win32').each([
    [0, 0, 0, ['run format:check', 'run typecheck']],
    [1, 0, 1, ['run format:check']],
    [0, 1, 1, ['run format:check', 'run typecheck']],
  ] as const)(
    'format=%i and types=%i produce exit %i',
    (formatCode, typeCode, expectedCode, calls) => {
      const root = mkdtempSync(join(tmpdir(), 'kode-git-hook-'))
      try {
        const log = join(root, 'calls')
        writeFileSync(
          join(root, 'bun'),
          '#!/bin/sh\nprintf "%s\\n" "$*" >> "$KODE_TEST_HOOK_LOG"\nif [ "$2" = "format:check" ]; then exit "$KODE_TEST_FORMAT_CODE"; fi\nexit "$KODE_TEST_TYPE_CODE"\n',
          { mode: 0o755 },
        )
        const result = spawnSync('/bin/sh', [resolve('.husky/pre-commit')], {
          env: {
            ...process.env,
            PATH: root + ':' + process.env.PATH,
            KODE_TEST_HOOK_LOG: log,
            KODE_TEST_FORMAT_CODE: String(formatCode),
            KODE_TEST_TYPE_CODE: String(typeCode),
          },
          timeout: 5000,
        })
        expect(result.status).toBe(expectedCode)
        expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([...calls])
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    },
  )
})
