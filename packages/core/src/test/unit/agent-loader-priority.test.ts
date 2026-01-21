import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { clearAgentCache, getAgentByType } from '#core/agent/loader'
import { getCwd, setCwd } from '#core/utils/state'

function writeAgentFile(args: {
  dir: string
  agentType: string
  description: string
  tools: '*' | string[]
  prompt: string
}) {
  mkdirSync(args.dir, { recursive: true })

  const toolsYaml =
    args.tools === '*'
      ? 'tools: "*"\n'
      : `tools:\n${args.tools.map(t => `  - ${t}`).join('\n')}\n`

  const content = `---\nname: ${args.agentType}\ndescription: ${JSON.stringify(
    args.description,
  )}\n${toolsYaml}---\n\n${args.prompt}\n`

  writeFileSync(join(args.dir, `${args.agentType}.md`), content, 'utf8')
}

test('agent loader precedence: project > user > built-in; .kode > .claude', async () => {
  const originalCwd = getCwd()
  const originalHome = process.env.HOME
  const originalKodeDir = process.env.KODE_CONFIG_DIR
  const originalAnyKodeDir = process.env.ANYKODE_CONFIG_DIR
  const originalClaudeDir = process.env.CLAUDE_CONFIG_DIR

  const base = mkdtempSync(join(tmpdir(), 'kode-agent-loader-'))
  const home = resolve(join(base, 'home'))
  const project = resolve(join(base, 'project'))

  const userKodeRoot = resolve(join(base, 'user-kode'))
  const userClaudeRoot = resolve(join(base, 'user-claude'))

  try {
    process.env.HOME = home
    process.env.KODE_CONFIG_DIR = userKodeRoot
    process.env.ANYKODE_CONFIG_DIR = ''
    process.env.CLAUDE_CONFIG_DIR = userClaudeRoot

    const userKodeAgentsDir = join(userKodeRoot, 'agents')
    const userClaudeAgentsDir = join(userClaudeRoot, 'agents')
    const projectKodeAgentsDir = join(project, '.kode', 'agents')
    const projectClaudeAgentsDir = join(project, '.claude', 'agents')

    // User-level: legacy < kode
    writeAgentFile({
      dir: userClaudeAgentsDir,
      agentType: 'UserWinsOverBuiltIn',
      description: 'legacy user agent',
      tools: '*',
      prompt: 'legacy user prompt',
    })
    writeAgentFile({
      dir: userKodeAgentsDir,
      agentType: 'UserWinsOverBuiltIn',
      description: 'kode user agent',
      tools: '*',
      prompt: 'kode user prompt',
    })

    // Project-level: legacy < kode; project overrides user
    writeAgentFile({
      dir: projectClaudeAgentsDir,
      agentType: 'UserWinsOverBuiltIn',
      description: 'legacy project agent',
      tools: '*',
      prompt: 'legacy project prompt',
    })
    writeAgentFile({
      dir: projectKodeAgentsDir,
      agentType: 'UserWinsOverBuiltIn',
      description: 'kode project agent',
      tools: '*',
      prompt: 'kode project prompt',
    })

    // Built-in override: user agent should override built-in agentType.
    writeAgentFile({
      dir: userKodeAgentsDir,
      agentType: 'general-purpose',
      description: 'override built-in general-purpose',
      tools: '*',
      prompt: 'user override prompt',
    })

    mkdirSync(project, { recursive: true })
    await setCwd(project)
    clearAgentCache()

    const resolvedFoo = await getAgentByType('UserWinsOverBuiltIn')
    expect(resolvedFoo?.systemPrompt).toBe('kode project prompt')

    const resolvedBuiltIn = await getAgentByType('general-purpose')
    expect(resolvedBuiltIn?.systemPrompt).toBe('user override prompt')
  } finally {
    process.env.HOME = originalHome
    process.env.KODE_CONFIG_DIR = originalKodeDir
    process.env.ANYKODE_CONFIG_DIR = originalAnyKodeDir
    process.env.CLAUDE_CONFIG_DIR = originalClaudeDir
    clearAgentCache()
    await setCwd(originalCwd)
  }
})
