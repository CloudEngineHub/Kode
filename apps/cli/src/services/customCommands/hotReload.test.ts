import { expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  loadCustomCommands,
  refreshCustomCommandWatcher,
  startCustomCommandWatcher,
  stopCustomCommandWatcher,
  subscribeCustomCommandReloads,
} from '#cli-services/customCommands'
import { __getWatchedDirPathsForTests } from '#cli-services/customCommands/watcher'
import { getCwd, setCwd } from '#core/utils/state'

function writeSkillFile(args: {
  skillsDir: string
  skillName: string
  description: string
  body: string
}) {
  const dir = join(args.skillsDir, args.skillName)
  mkdirSync(dir, { recursive: true })
  const content = `---\nname: ${args.skillName}\ndescription: ${JSON.stringify(
    args.description,
  )}\n---\n\n${args.body}\n`
  const filePath = join(dir, 'SKILL.md')
  writeFileSync(filePath, content, 'utf8')
  return filePath
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error('Timed out waiting for condition')
}

test('custom command watcher debounces skill reloads', async () => {
  const originalCwd = getCwd()
  const originalHome = process.env.HOME
  const originalKodeDir = process.env.KODE_CONFIG_DIR
  const originalClaudeDir = process.env.CLAUDE_CONFIG_DIR

  const base = mkdtempSync(join(tmpdir(), 'kode-custom-commands-watcher-'))
  const home = resolve(join(base, 'home'))
  const project = resolve(join(base, 'project'))
  const userKodeRoot = resolve(join(base, 'user-kode'))

  let onChangeCount = 0
  let reloadEventCount = 0
  let lastChangedPaths: string[] = []

  const unsubscribe = subscribeCustomCommandReloads(event => {
    reloadEventCount += 1
    lastChangedPaths = event.changedPaths
  })

  try {
    process.env.HOME = home
    process.env.KODE_CONFIG_DIR = userKodeRoot
    process.env.CLAUDE_CONFIG_DIR = resolve(join(base, 'user-claude'))

    const projectSkillsDir = join(project, '.kode', 'skills')
    mkdirSync(projectSkillsDir, { recursive: true })

    mkdirSync(project, { recursive: true })
    await setCwd(project)

    const skillName = 'hot-reload-skill'
    await import('#cli-commands')
    const initialCommands = await loadCustomCommands()
    expect(
      initialCommands.some(cmd => cmd.userFacingName() === skillName),
    ).toBe(false)

    await startCustomCommandWatcher(() => {
      onChangeCount += 1
    })

    // Ensure watcher has time to attach.
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(__getWatchedDirPathsForTests()).toContain(projectSkillsDir)

    writeSkillFile({
      skillsDir: projectSkillsDir,
      skillName,
      description: 'v1',
      body: 'v1',
    })
    writeSkillFile({
      skillsDir: projectSkillsDir,
      skillName,
      description: 'v2',
      body: 'v2',
    })

    await waitUntil(() => reloadEventCount >= 1, 6000)

    expect(onChangeCount).toBe(1)
    expect(reloadEventCount).toBe(1)
    if (lastChangedPaths.length > 0) {
      const skillDir = join(projectSkillsDir, skillName)
      const skillFile = join(skillDir, 'SKILL.md')
      expect(
        lastChangedPaths.includes(skillFile) ||
          lastChangedPaths.includes(skillDir),
      ).toBe(true)
    }

    const commands = await loadCustomCommands()
    expect(commands.some(cmd => cmd.userFacingName() === skillName)).toBe(true)
  } finally {
    unsubscribe()
    await stopCustomCommandWatcher()
    process.env.HOME = originalHome
    process.env.KODE_CONFIG_DIR = originalKodeDir
    process.env.CLAUDE_CONFIG_DIR = originalClaudeDir
    await setCwd(originalCwd)
  }
})

test('custom command watcher watches skill pack nested directories (depth=2)', async () => {
  const originalCwd = getCwd()
  const originalHome = process.env.HOME
  const originalKodeDir = process.env.KODE_CONFIG_DIR
  const originalClaudeDir = process.env.CLAUDE_CONFIG_DIR

  const base = mkdtempSync(join(tmpdir(), 'kode-custom-commands-skill-depth-'))
  const home = resolve(join(base, 'home'))
  const project = resolve(join(base, 'project'))
  const userKodeRoot = resolve(join(base, 'user-kode'))

  try {
    process.env.HOME = home
    process.env.KODE_CONFIG_DIR = userKodeRoot
    process.env.CLAUDE_CONFIG_DIR = resolve(join(base, 'user-claude'))

    mkdirSync(project, { recursive: true })
    await setCwd(project)

    const projectSkillsDir = join(project, '.kode', 'skills')
    mkdirSync(projectSkillsDir, { recursive: true })

    const skillName = 'depth-skill'
    writeSkillFile({
      skillsDir: projectSkillsDir,
      skillName,
      description: 'depth test',
      body: 'v1',
    })

    const referencesDir = join(projectSkillsDir, skillName, 'references')
    mkdirSync(referencesDir, { recursive: true })
    writeFileSync(join(referencesDir, 'notes.md'), '# notes\n', 'utf8')

    await startCustomCommandWatcher()

    // Ensure watcher has time to attach.
    await new Promise(resolve => setTimeout(resolve, 50))

    const watched = __getWatchedDirPathsForTests()
    expect(watched).toContain(projectSkillsDir)
    expect(watched).toContain(join(projectSkillsDir, skillName))
    expect(watched).toContain(referencesDir)
  } finally {
    await stopCustomCommandWatcher()
    process.env.HOME = originalHome
    process.env.KODE_CONFIG_DIR = originalKodeDir
    process.env.CLAUDE_CONFIG_DIR = originalClaudeDir
    await setCwd(originalCwd)
  }
})

test('refreshCustomCommandWatcher rebuilds watched dirs after cwd changes', async () => {
  const originalCwd = getCwd()
  const originalHome = process.env.HOME
  const originalKodeDir = process.env.KODE_CONFIG_DIR
  const originalClaudeDir = process.env.CLAUDE_CONFIG_DIR

  const base = mkdtempSync(join(tmpdir(), 'kode-custom-commands-cwd-refresh-'))
  const home = resolve(join(base, 'home'))
  const project1 = resolve(join(base, 'project-1'))
  const project2 = resolve(join(base, 'project-2'))
  const userKodeRoot = resolve(join(base, 'user-kode'))

  try {
    process.env.HOME = home
    process.env.KODE_CONFIG_DIR = userKodeRoot
    process.env.CLAUDE_CONFIG_DIR = resolve(join(base, 'user-claude'))

    mkdirSync(project1, { recursive: true })
    mkdirSync(project2, { recursive: true })

    const skillsDir1 = join(project1, '.kode', 'skills')
    const skillsDir2 = join(project2, '.kode', 'skills')
    mkdirSync(skillsDir1, { recursive: true })
    mkdirSync(skillsDir2, { recursive: true })

    await setCwd(project1)
    await startCustomCommandWatcher()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(__getWatchedDirPathsForTests()).toContain(skillsDir1)

    await setCwd(project2)
    await refreshCustomCommandWatcher()
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(__getWatchedDirPathsForTests()).toContain(skillsDir2)
  } finally {
    await stopCustomCommandWatcher()
    process.env.HOME = originalHome
    process.env.KODE_CONFIG_DIR = originalKodeDir
    process.env.CLAUDE_CONFIG_DIR = originalClaudeDir
    await setCwd(originalCwd)
  }
})
