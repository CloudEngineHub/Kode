import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  PERSISTED_OUTPUT_CLOSE_TAG,
  PERSISTED_OUTPUT_OPEN_TAG,
  maybePersistOversizedToolResult,
} from '#core/utils/toolResultPersistence'
import {
  resetKodeAgentSessionIdForTests,
  setKodeAgentSessionId,
} from '#protocol/utils/kodeAgentSessionId'
import { sanitizeProjectNameForSessionStore } from '#protocol/utils/kodeAgentSessionLog'

describe('tool result persistence (Claude-compatible persisted-output placeholder)', () => {
  const originalConfigDir = process.env.KODE_CONFIG_DIR
  const originalAnyKodeConfigDir = process.env.ANYKODE_CONFIG_DIR

  let configDir: string
  let projectDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'kode-tool-results-config-'))
    projectDir = mkdtempSync(join(tmpdir(), 'kode-tool-results-project-'))
    process.env.KODE_CONFIG_DIR = configDir
    delete process.env.ANYKODE_CONFIG_DIR
    setKodeAgentSessionId('704b907b-2b0f-478d-a7cb-b9fecf921913')
  })

  afterEach(() => {
    resetKodeAgentSessionIdForTests()
    if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
    else process.env.KODE_CONFIG_DIR = originalConfigDir

    if (originalAnyKodeConfigDir === undefined)
      delete process.env.ANYKODE_CONFIG_DIR
    else process.env.ANYKODE_CONFIG_DIR = originalAnyKodeConfigDir

    rmSync(configDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('persists oversized string tool result to session tool-results and returns persisted-output placeholder', () => {
    const toolUseId = 'toolu_test_txt'
    const content = 'hello\n'.repeat(200)

    const result = maybePersistOversizedToolResult({
      cwd: projectDir,
      toolUseId,
      content,
      maxResultSizeChars: 50,
    })

    expect(typeof result).toBe('string')
    expect(result).toContain(PERSISTED_OUTPUT_OPEN_TAG)
    expect(result).toContain(PERSISTED_OUTPUT_CLOSE_TAG)
    expect(result).toContain('Output too large')
    expect(result).toContain('Full output saved to:')

    const filepath = join(
      configDir,
      'projects',
      sanitizeProjectNameForSessionStore(projectDir),
      '704b907b-2b0f-478d-a7cb-b9fecf921913',
      'tool-results',
      `${toolUseId}.txt`,
    )
    expect(result).toContain(filepath)
    expect(existsSync(filepath)).toBe(true)
    expect(readFileSync(filepath, 'utf8')).toBe(content)
  })

  test('persists oversized JSON tool result to session tool-results and returns persisted-output placeholder', () => {
    const toolUseId = 'toolu_test_json'
    const content = Array.from({ length: 20 }, (_, index) => ({
      index,
      text: 'x'.repeat(20),
    }))

    const result = maybePersistOversizedToolResult({
      cwd: projectDir,
      toolUseId,
      content,
      maxResultSizeChars: 50,
    })

    expect(typeof result).toBe('string')
    expect(result).toContain(PERSISTED_OUTPUT_OPEN_TAG)
    expect(result).toContain(PERSISTED_OUTPUT_CLOSE_TAG)

    const filepath = join(
      configDir,
      'projects',
      sanitizeProjectNameForSessionStore(projectDir),
      '704b907b-2b0f-478d-a7cb-b9fecf921913',
      'tool-results',
      `${toolUseId}.json`,
    )
    expect(result).toContain(filepath)
    expect(existsSync(filepath)).toBe(true)
    expect(readFileSync(filepath, 'utf8')).toBe(
      JSON.stringify(content, null, 2),
    )
  })

  test('skips persistence for image-containing content arrays (matches Claude behavior)', () => {
    const toolUseId = 'toolu_test_image'
    const content = [{ type: 'image', source: { type: 'base64', data: 'abc' } }]

    const result = maybePersistOversizedToolResult({
      cwd: projectDir,
      toolUseId,
      content,
      maxResultSizeChars: 0,
    })

    expect(result).toEqual(content)

    const filepath = join(
      configDir,
      'projects',
      sanitizeProjectNameForSessionStore(projectDir),
      '704b907b-2b0f-478d-a7cb-b9fecf921913',
      'tool-results',
      `${toolUseId}.json`,
    )
    expect(existsSync(filepath)).toBe(false)
  })
})
