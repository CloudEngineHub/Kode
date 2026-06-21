import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  __getAgentFileCacheStatsForTests,
  __resetAgentFileCacheStatsForTests,
  clearAgentCache,
  getAgentByType,
} from '#core/agent/loader'
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

test('agent loader LRU memoization reuses unchanged parses and invalidates on file change', async () => {
  const originalCwd = getCwd()
  const originalHome = process.env.HOME
  const originalKodeDir = process.env.KODE_CONFIG_DIR
  const originalAnyKodeDir = process.env.ANYKODE_CONFIG_DIR
  const originalClaudeDir = process.env.CLAUDE_CONFIG_DIR

  const base = mkdtempSync(join(tmpdir(), 'kode-agent-loader-cache-'))
  const home = resolve(join(base, 'home'))
  const project = resolve(join(base, 'project'))
  const userKodeRoot = resolve(join(base, 'user-kode'))

  try {
    process.env.HOME = home
    process.env.KODE_CONFIG_DIR = userKodeRoot
    process.env.ANYKODE_CONFIG_DIR = ''
    process.env.CLAUDE_CONFIG_DIR = resolve(join(base, 'user-claude'))

    const userKodeAgentsDir = join(userKodeRoot, 'agents')
    const projectKodeAgentsDir = join(project, '.kode', 'agents')

    // Put the agent in both user + project so we still traverse multiple dirs.
    writeAgentFile({
      dir: userKodeAgentsDir,
      agentType: 'CacheAgent',
      description: 'user cache agent',
      tools: '*',
      prompt: 'v1-user',
    })
    writeAgentFile({
      dir: projectKodeAgentsDir,
      agentType: 'CacheAgent',
      description: 'project cache agent',
      tools: '*',
      prompt: 'v1-project',
    })

    mkdirSync(project, { recursive: true })
    await setCwd(project)

    __resetAgentFileCacheStatsForTests()
    clearAgentCache()

    const first = await getAgentByType('CacheAgent')
    expect(first?.systemPrompt).toBe('v1-project')
    const s1 = __getAgentFileCacheStatsForTests()
    expect(s1.hits).toBe(0)
    expect(s1.misses).toBeGreaterThan(0)

    // Force a reload without changing files: should hit the file cache.
    clearAgentCache()
    const second = await getAgentByType('CacheAgent')
    expect(second?.systemPrompt).toBe('v1-project')
    const s2 = __getAgentFileCacheStatsForTests()
    expect(s2.hits).toBeGreaterThan(0)

    // Modify the project agent file: should invalidate via mtime/size.
    await new Promise(resolve => setTimeout(resolve, 5))
    writeAgentFile({
      dir: projectKodeAgentsDir,
      agentType: 'CacheAgent',
      description: 'project cache agent updated',
      tools: '*',
      prompt: 'v2-project',
    })

    clearAgentCache()
    const third = await getAgentByType('CacheAgent')
    expect(third?.systemPrompt).toBe('v2-project')
    const s3 = __getAgentFileCacheStatsForTests()
    expect(s3.misses).toBeGreaterThan(s2.misses)
  } finally {
    process.env.HOME = originalHome
    process.env.KODE_CONFIG_DIR = originalKodeDir
    process.env.ANYKODE_CONFIG_DIR = originalAnyKodeDir
    process.env.CLAUDE_CONFIG_DIR = originalClaudeDir
    __resetAgentFileCacheStatsForTests()
    clearAgentCache()
    await setCwd(originalCwd)
  }
})
