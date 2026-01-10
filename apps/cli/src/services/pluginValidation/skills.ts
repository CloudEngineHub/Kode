import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'

import { parseFrontmatter } from '#cli-services/customCommands'

import type { ValidationIssue } from './types'

function getStringField(obj: unknown, key: string): string {
  if (!obj || typeof obj !== 'object') return ''
  const record = obj as Record<string, unknown>
  const value = record[key]
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function validateSkillDir(skillDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const name = skillDir.split(sep).pop() || ''
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    issues.push({
      path: `skills/${name}`,
      message:
        'Invalid skill directory name (must be lowercase kebab-case, 1–64 chars)',
    })
    return issues
  }

  if (!existsSync(skillDir) || !lstatSync(skillDir).isDirectory()) {
    issues.push({
      path: `skills/${name}`,
      message: 'Skill directory not found',
    })
    return issues
  }

  const skillFileCandidates = [
    join(skillDir, 'SKILL.md'),
    join(skillDir, 'skill.md'),
  ]
  const skillFile = skillFileCandidates.find(p => existsSync(p))
  if (!skillFile) {
    issues.push({
      path: `skills/${name}`,
      message: 'Missing SKILL.md (or skill.md)',
    })
    return issues
  }

  try {
    const raw = readFileSync(skillFile, 'utf8')
    const { frontmatter } = parseFrontmatter(raw)

    const declared = getStringField(frontmatter, 'name')
    if (!declared) {
      issues.push({
        path: `${name}/SKILL.md`,
        message: 'Missing required frontmatter field: name',
      })
    } else if (declared !== name) {
      issues.push({
        path: `${name}/SKILL.md`,
        message: `Frontmatter name must match directory name (dir=${name}, name=${declared})`,
      })
    }

    const description = getStringField(frontmatter, 'description')
    if (!description) {
      issues.push({
        path: `${name}/SKILL.md`,
        message: 'Missing required frontmatter field: description',
      })
    } else if (description.length > 1024) {
      issues.push({
        path: `${name}/SKILL.md`,
        message: 'description must be <= 1024 characters',
      })
    }
  } catch (err) {
    issues.push({
      path: `${name}/SKILL.md`,
      message: `Failed to parse SKILL.md: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  return issues
}
