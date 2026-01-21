import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { subscribeAgentReloads } from '#core/agent/events'
import {
  clearAgentCache,
  startAgentWatcher,
  stopAgentWatcher,
} from '#core/agent/loader'
import { getCwd, setCwd } from '#core/utils/state'

function writeAgentFile(args: {
  dir: string
  agentType: string
  description: string
  prompt: string
}) {
  mkdirSync(args.dir, { recursive: true })

  const content = `---\nname: ${args.agentType}\ndescription: ${JSON.stringify(
    args.description,
  )}\ntools: \"*\"\n---\n\n${args.prompt}\n`

  const filePath = join(args.dir, `${args.agentType}.md`)
  writeFileSync(filePath, content, 'utf8')
  return filePath
}

test('agent watcher debounces reload notifications', async () => {
  const originalCwd = getCwd()
  const originalHome = process.env.HOME
  const originalKodeDir = process.env.KODE_CONFIG_DIR
  const originalAnyKodeDir = process.env.ANYKODE_CONFIG_DIR
  const originalClaudeDir = process.env.CLAUDE_CONFIG_DIR

  const base = mkdtempSync(join(tmpdir(), 'kode-agent-watcher-'))
  const home = resolve(join(base, 'home'))
  const project = resolve(join(base, 'project'))
  const userKodeRoot = resolve(join(base, 'user-kode'))

  let onChangeCount = 0
  let reloadEventCount = 0
  let lastChangedPaths: string[] = []

  const unsubscribe = subscribeAgentReloads(event => {
    reloadEventCount += 1
    lastChangedPaths = event.changedPaths
  })

  try {
    process.env.HOME = home
    process.env.KODE_CONFIG_DIR = userKodeRoot
    process.env.ANYKODE_CONFIG_DIR = ''
    process.env.CLAUDE_CONFIG_DIR = resolve(join(base, 'user-claude'))

    const projectAgentsDir = join(project, '.kode', 'agents')
    const agentPath = writeAgentFile({
      dir: projectAgentsDir,
      agentType: 'WatcherAgent',
      description: 'watcher test agent',
      prompt: 'v1',
    })

    mkdirSync(project, { recursive: true })
    await setCwd(project)
    clearAgentCache()

    await startAgentWatcher(() => {
      onChangeCount += 1
    })

    // Ensure watcher has time to attach.
    await new Promise(resolve => setTimeout(resolve, 50))

    // Trigger multiple changes inside the debounce window.
    writeAgentFile({
      dir: projectAgentsDir,
      agentType: 'WatcherAgent',
      description: 'watcher test agent',
      prompt: 'v2',
    })
    writeAgentFile({
      dir: projectAgentsDir,
      agentType: 'WatcherAgent',
      description: 'watcher test agent',
      prompt: 'v3',
    })

    await new Promise(resolve => setTimeout(resolve, 350))

    expect(onChangeCount).toBe(1)
    expect(reloadEventCount).toBe(1)
    if (lastChangedPaths.length > 0) {
      expect(lastChangedPaths).toContain(agentPath)
    }
  } finally {
    unsubscribe()
    await stopAgentWatcher()
    process.env.HOME = originalHome
    process.env.KODE_CONFIG_DIR = originalKodeDir
    process.env.ANYKODE_CONFIG_DIR = originalAnyKodeDir
    process.env.CLAUDE_CONFIG_DIR = originalClaudeDir
    clearAgentCache()
    await setCwd(originalCwd)
  }
})
