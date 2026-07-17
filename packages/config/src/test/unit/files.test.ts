import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { readSettingsFile } from '../../files'

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(path.dirname(process.cwd()), `.tmp-${prefix}-`))
}

describe('settings files', () => {
  test('readSettingsFile accepts UTF-8 BOM-prefixed JSON', () => {
    const tmp = makeTempDir('settings-files')
    const filePath = path.join(tmp, 'settings.json')

    try {
      writeFileSync(filePath, '\uFEFF{"theme":"dark"}', 'utf8')
      expect(readSettingsFile(filePath)).toEqual({ theme: 'dark' })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
