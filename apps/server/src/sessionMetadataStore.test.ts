import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  getSessionMetadataFilePath,
  readSessionMetadata,
  writeSessionMetadata,
} from './sessionMetadataStore'

const temporaryDirectories: string[] = []
const originalConfigDir = process.env.KODE_CONFIG_DIR

function createSessionStoreFixture(): { cwd: string; sessionId: string } {
  const root = mkdtempSync(join(tmpdir(), 'kode-session-metadata-'))
  const cwd = join(root, 'project')
  const configDir = join(root, 'config')
  temporaryDirectories.push(root)
  process.env.KODE_CONFIG_DIR = configDir
  return {
    cwd,
    sessionId: '11111111-1111-4111-8111-111111111111',
  }
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
  if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
  else process.env.KODE_CONFIG_DIR = originalConfigDir
})

describe('session metadata store', () => {
  test('atomically persists nullable metadata and preserves the schema version', () => {
    const { cwd, sessionId } = createSessionStoreFixture()

    const created = writeSessionMetadata({
      cwd,
      sessionId,
      patch: { customTitle: 'Release checklist', tag: 'release' },
      defaults: { summary: 'Initial summary' },
    })
    const updated = writeSessionMetadata({
      cwd,
      sessionId,
      patch: { customTitle: null, tag: null, summary: 'Updated summary' },
    })

    expect(created.schemaVersion).toBe(1)
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.customTitle).toBeNull()
    expect(updated.tag).toBeNull()
    expect(updated.summary).toBe('Updated summary')
    expect(readSessionMetadata({ cwd, sessionId })).toEqual({
      kind: 'ok',
      metadata: updated,
    })
  })

  test('fails closed when an existing metadata file has an unknown schema', () => {
    const { cwd, sessionId } = createSessionStoreFixture()
    const path = getSessionMetadataFilePath({ cwd, sessionId })
    // Seed the project directory through the supported writer, then replace the
    // sidecar with an unsupported version to verify fail-closed behavior.
    writeSessionMetadata({ cwd, sessionId, patch: {} })
    writeFileSync(
      path,
      JSON.stringify({ schemaVersion: 2, sessionId }) + '\n',
      'utf8',
    )

    expect(readSessionMetadata({ cwd, sessionId })).toEqual({ kind: 'invalid' })
    expect(() => writeSessionMetadata({ cwd, sessionId, patch: {} })).toThrow(
      'Session metadata is invalid',
    )
  })
})
