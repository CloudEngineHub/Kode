import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { loadSkillDirectoryCommandsFromBaseDir } from './discovery'

test('bundled skills are discoverable', () => {
  const skillsDirCandidates = [
    join(process.cwd(), 'packages', 'builtin-skills', 'skills'),
    join(process.cwd(), 'resources', 'skills'),
  ]
  const skillsDir = skillsDirCandidates.find(p => existsSync(p))
  if (!skillsDir) throw new Error('No bundled skills directory found')

  const skills = loadSkillDirectoryCommandsFromBaseDir(
    skillsDir,
    'userSettings',
    'user',
  )

  const names = skills.map(s => s.userFacingName())
  expect(names).toContain('permissions-debug')
})
