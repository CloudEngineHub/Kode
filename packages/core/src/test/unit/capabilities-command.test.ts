import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import capabilities from '#cli-commands/builtin/capabilities'
import { clearAgentCache, getAgentByType } from '#core/utils/agentLoader'
import { setCwd } from '#core/utils/state'

function extractFirstPromptText(prompt: any[]): string {
  const first = prompt[0]
  const content = first?.content
  const firstText =
    Array.isArray(content) && content[0]?.type === 'text' ? content[0].text : ''
  return String(firstText || '')
}

describe('/capabilities (prompt command + built-in agent)', () => {
  const runnerCwd = process.cwd()
  let projectDir: string

  beforeEach(async () => {
    clearAgentCache()
    projectDir = mkdtempSync(join(tmpdir(), 'kode-capabilities-proj-'))
    await setCwd(projectDir)
  })

  afterEach(async () => {
    clearAgentCache()
    await setCwd(runnerCwd)
    rmSync(projectDir, { recursive: true, force: true })
  })

  test('expands to Create-a-Task prompt with JSON-escaped args', async () => {
    expect(capabilities.disableNonInteractive).toBe(true)
    if (capabilities.type !== 'prompt') {
      throw new Error('Expected /capabilities to be a prompt command')
    }

    const userPrompt = 'hello "world"\nline2'
    const prompt = await capabilities.getPromptForCommand(userPrompt)
    const text = extractFirstPromptText(prompt)

    expect(text).toContain('subagent_type "capabilities-manager"')
    expect(text).toContain(JSON.stringify(userPrompt))
  })

  test('empty args use the default audit prompt', async () => {
    if (capabilities.type !== 'prompt') {
      throw new Error('Expected /capabilities to be a prompt command')
    }

    const prompt = await capabilities.getPromptForCommand('   ')
    const text = extractFirstPromptText(prompt)

    expect(text).toContain('capabilities audit')
  })

  test('built-in agent capabilities-manager is available', async () => {
    const agent = await getAgentByType('capabilities-manager')
    expect(agent).toBeTruthy()
    expect(agent!.location).toBe('built-in')
    if (Array.isArray(agent!.tools)) {
      expect(agent!.tools).toContain('Task')
    }
  })
})
