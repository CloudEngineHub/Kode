import type { Command } from '../types'

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { CACHE_PATHS } from '#core/utils/log'
import { launchExternalEditorForFilePath } from '#cli-utils/externalEditor'

type DumpFile = {
  name: string
  path: string
  mtimeMs: number
}

function listDumpFiles(dir: string): DumpFile[] {
  if (!existsSync(dir)) return []

  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }

  const files: DumpFile[] = []
  for (const name of names) {
    if (!name.endsWith('.txt')) continue
    const path = join(dir, name)
    try {
      const st = statSync(path)
      if (!st.isFile()) continue
      files.push({ name, path, mtimeMs: st.mtimeMs })
    } catch {
      continue
    }
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files
}

function matchDumpFile(files: DumpFile[], query: string): DumpFile[] {
  const q = query.trim()
  if (!q || q === 'latest') return files.slice(0, 1)
  return files.filter(f => f.name.includes(q))
}

const gateDump = {
  type: 'local',
  name: 'gate-dump',
  description: 'Open the latest Bash LLM gate failure dump',
  isEnabled: true,
  isHidden: false,
  argumentHint: '[latest|list|<substring>]',
  userFacingName() {
    return 'gate-dump'
  },
  aliases: ['gate-dumps', 'bash-gate-dump'],
  async call(args) {
    const dir = join(CACHE_PATHS.errors(), 'bash-llm-gate')
    const files = listDumpFiles(dir)
    if (files.length === 0) {
      return `No Bash LLM gate dumps found at: ${dir}`
    }

    const query = (args ?? '').trim()
    if (query === 'list') {
      return [
        `Bash LLM gate dumps (${files.length}):`,
        ...files.map(f => f.path),
      ].join('\n')
    }

    const matches = matchDumpFile(files, query)
    if (matches.length === 0) {
      return `No dump matches "${query}". Directory: ${dir}`
    }
    if (matches.length > 1) {
      return [
        `Multiple dumps match "${query}" (${matches.length}):`,
        ...matches.slice(0, 20).map(f => f.path),
        ...(matches.length > 20 ? ['(truncated)'] : []),
      ].join('\n')
    }

    const file = matches[0]!
    const opened = await launchExternalEditorForFilePath(file.path)
    if (!('error' in opened)) {
      return `Opened: ${file.path} (${opened.editorLabel})`
    }
    return `Could not open editor. File: ${file.path}. Error: ${opened.error.message}`
  },
} satisfies Command

export default gateDump
