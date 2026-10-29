import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import which from 'which'
import { escapeSocatPath } from '#runtime/shell/socat'

describe('socat address path boundary', () => {
  test('escapes address separators and grouping characters independently of shell syntax', () => {
    expect(escapeSocatPath("/tmp/O'Brien,[literal]:x!!\\.sock")).toBe(
      "/tmp/O\\'Brien\\,\\[literal\\]\\:x\\!\\!\\\\.sock",
    )
  })

  const socat = which.sync('socat', { nothrow: true })
  test
    .skipIf(!socat || process.platform === 'win32')
    .each([
      'space name',
      "O'Brien",
      'a,b:c',
      'a"b',
      'a\\b',
      '$(literal);x',
      'a!!b',
      '(a)[b]{c}',
      'unclosed[',
      'line\nbreak',
    ])('real socat parses filename %j literally', filename => {
    const root = mkdtempSync(join(tmpdir(), 'kode-socat-'))
    try {
      const output = join(root, filename)
      // CREATE uses socat's address parser without needing sockets or a network.
      const result = spawnSync(
        socat!,
        ['-u', '-', `CREATE:${escapeSocatPath(output)}`],
        {
          input: 'round trip',
          encoding: 'utf8',
          timeout: 5000,
        },
      )
      expect(result.status).toBe(0)
      expect(readFileSync(output, 'utf8')).toBe('round trip')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
