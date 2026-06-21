import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  resetKodeAgentSessionIdForTests,
  setKodeAgentSessionId,
} from '#protocol/utils/kodeAgentSessionId'

import { loadSkillDirectoryCommandsFromBaseDir } from './discovery'

function writeSkillFile(args: {
  skillDir: string
  name: string
  description?: string
  body: string
}) {
  mkdirSync(args.skillDir, { recursive: true })
  const fmLines = ['---', `name: ${args.name}`]
  if (args.description !== undefined) {
    fmLines.push(`description: ${JSON.stringify(args.description)}`)
  }
  fmLines.push('allowed-tools: Read', '---', '')
  const content = `${fmLines.join('\n')}${args.body}\n`
  writeFileSync(join(args.skillDir, 'SKILL.md'), content, 'utf8')
}

test('skills load only frontmatter at discovery and read body on demand', async () => {
  const base = mkdtempSync(join(tmpdir(), 'kode-skill-loader-'))
  const skillsDir = resolve(join(base, 'skills'))
  const skillDir = join(skillsDir, 'my-skill')

  writeSkillFile({
    skillDir,
    name: 'my-skill',
    description: 'Test skill description',
    body: '# v1 body',
  })

  const commands = loadSkillDirectoryCommandsFromBaseDir(
    skillsDir,
    'localSettings',
    'project',
  )

  expect(commands).toHaveLength(1)
  const cmd = commands[0]!
  expect(cmd.userFacingName()).toBe('my-skill')
  expect(cmd.description).toContain('Test skill description')

  // Update body after discovery: lazy loading should pick up the new body.
  writeSkillFile({
    skillDir,
    name: 'my-skill',
    description: 'Test skill description',
    body: '# v2 body',
  })

  const promptMessages = await cmd.getPromptForCommand('')
  expect(promptMessages[0]?.content).toContain('# v2 body')
})

test('skills without frontmatter description are skipped', () => {
  const base = mkdtempSync(join(tmpdir(), 'kode-skill-loader-missing-desc-'))
  const skillsDir = resolve(join(base, 'skills'))
  const skillDir = join(skillsDir, 'no-desc')

  writeSkillFile({
    skillDir,
    name: 'no-desc',
    body: 'body',
  })

  const commands = loadSkillDirectoryCommandsFromBaseDir(
    skillsDir,
    'localSettings',
    'project',
  )

  expect(commands).toHaveLength(0)
})

test('skills support frontmatter context/agent and expand ${CLAUDE_SESSION_ID}', async () => {
  const base = mkdtempSync(join(tmpdir(), 'kode-skill-loader-context-'))
  const skillsDir = resolve(join(base, 'skills'))
  const skillDir = join(skillsDir, 'fork-skill')

  mkdirSync(skillDir, { recursive: true })
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    [
      '---',
      'name: fork-skill',
      'description: "Forked skill"',
      'context: fork',
      'agent: general-purpose',
      '---',
      '',
      'Session: ${CLAUDE_SESSION_ID}',
      '',
    ].join('\n'),
    'utf8',
  )

  const sessionId = 'test-session-id'
  setKodeAgentSessionId(sessionId)

  try {
    const commands = loadSkillDirectoryCommandsFromBaseDir(
      skillsDir,
      'localSettings',
      'project',
    )

    expect(commands).toHaveLength(1)
    const cmd = commands[0]!
    expect(cmd.context).toBe('fork')
    expect(cmd.agent).toBe('general-purpose')

    const promptMessages = await cmd.getPromptForCommand('')
    const text = String(promptMessages[0]?.content ?? '')
    expect(text).toContain(`Session: ${sessionId}`)
    expect(text).not.toContain('${CLAUDE_SESSION_ID}')
  } finally {
    resetKodeAgentSessionIdForTests()
  }
})
