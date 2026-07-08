import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateFileSuggestions } from './fileSuggestions'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kode-file-suggestions-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe('generateFileSuggestions', () => {
  test('sorts directories before files while preserving prefix filtering', () => {
    const cwd = makeTempDir()
    mkdirSync(join(cwd, 'apple-dir'))
    mkdirSync(join(cwd, 'apricot-dir'))
    writeFileSync(join(cwd, 'apple-file.txt'), '')
    writeFileSync(join(cwd, 'banana-file.txt'), '')

    const suggestions = generateFileSuggestions({ prefix: 'ap', cwd })

    expect(suggestions.map(item => item.value)).toEqual([
      'apple-dir/',
      'apricot-dir/',
      'apple-file.txt',
    ])
  })
})
