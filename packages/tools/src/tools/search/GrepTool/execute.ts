import { stat as statAsync } from 'fs/promises'

import { getAbsolutePath } from '#core/utils/file'
import { ripGrep } from '#core/utils/ripgrep'
import { getBunShellSandboxPlan } from '#core/utils/sandbox/bunShellSandboxPlan'
import { getCwd } from '#core/utils/state'

import {
  EXCLUDED_DIRS,
  paginate,
  parseGlobString,
  toProjectRelativeIfPossible,
} from './helpers'
import type { GrepToolCallInput, GrepToolOutput } from './types'
import type { ToolUseContext } from '#core/tooling/Tool'

export async function runGrepTool(args: {
  input: GrepToolCallInput
  toolUseContext: ToolUseContext
}): Promise<GrepToolOutput> {
  const {
    pattern,
    path,
    glob,
    type,
    output_mode = 'files_with_matches',
    '-B': before,
    '-A': after,
    '-C': context,
    '-n': lineNumbers = true,
    '-i': caseInsensitive = false,
    head_limit,
    offset = 0,
    multiline = false,
  } = args.input

  const start = Date.now()
  const absolutePath = getAbsolutePath(path) || getCwd()

  const baseArgs: string[] = ['--hidden']
  for (const dir of EXCLUDED_DIRS) {
    baseArgs.push('--glob', `!${dir}`)
  }
  baseArgs.push('--max-columns', '500')
  if (multiline) {
    baseArgs.push('-U', '--multiline-dotall')
  }
  if (caseInsensitive) {
    baseArgs.push('-i')
  }
  if (type) {
    baseArgs.push('--type', type)
  }

  const appliedLimit = head_limit !== undefined ? head_limit : undefined
  const appliedOffset = offset || 0

  if (glob) {
    for (const g of parseGlobString(glob)) {
      baseArgs.push('--glob', g)
    }
  }

  const rgArgs: string[] = [...baseArgs]
  if (output_mode === 'files_with_matches') rgArgs.push('-l')
  else if (output_mode === 'count') rgArgs.push('-c')

  if (lineNumbers && output_mode === 'content') rgArgs.push('-n')

  if (context !== undefined && output_mode === 'content') {
    rgArgs.push('-C', String(context))
  } else if (output_mode === 'content') {
    if (before !== undefined) rgArgs.push('-B', String(before))
    if (after !== undefined) rgArgs.push('-A', String(after))
  }

  if (String(pattern).startsWith('-')) rgArgs.push('-e', String(pattern))
  else rgArgs.push(String(pattern))

  const sandboxPlan = getBunShellSandboxPlan({
    command: 'rg',
    toolUseContext: args.toolUseContext,
  })
  const lines = await ripGrep(
    rgArgs,
    absolutePath,
    args.toolUseContext.abortController.signal,
    {
      sandbox: sandboxPlan.settings.enabled
        ? sandboxPlan.bunShellSandboxOptions
        : undefined,
    },
  )

  if (output_mode === 'content') {
    const rewritten = lines.map(line => {
      const idx = line.indexOf(':')
      if (idx > 0) {
        const filePart = line.slice(0, idx)
        const rest = line.slice(idx)
        return toProjectRelativeIfPossible(filePart) + rest
      }
      return line
    })

    const window = paginate(rewritten, appliedLimit, appliedOffset)
    return {
      mode: 'content',
      numFiles: 0,
      filenames: [],
      content: window.join('\n'),
      numLines: window.length,
      ...(appliedLimit !== undefined ? { appliedLimit } : {}),
      ...(appliedOffset > 0 ? { appliedOffset } : {}),
      durationMs: Date.now() - start,
    }
  }

  if (output_mode === 'count') {
    const rewritten = lines.map(line => {
      const idx = line.lastIndexOf(':')
      if (idx > 0) {
        const filePart = line.slice(0, idx)
        const rest = line.slice(idx)
        return toProjectRelativeIfPossible(filePart) + rest
      }
      return line
    })

    const window = paginate(rewritten, appliedLimit, appliedOffset)
    let numMatches = 0
    let numFiles = 0
    for (const entry of window) {
      const idx = entry.lastIndexOf(':')
      if (idx > 0) {
        const countStr = entry.slice(idx + 1)
        const count = Number.parseInt(countStr, 10)
        if (!Number.isNaN(count)) {
          numMatches += count
          numFiles += 1
        }
      }
    }

    return {
      mode: 'count',
      numFiles,
      filenames: [],
      content: window.join('\n'),
      numMatches,
      ...(appliedLimit !== undefined ? { appliedLimit } : {}),
      ...(appliedOffset > 0 ? { appliedOffset } : {}),
      durationMs: Date.now() - start,
    }
  }

  const stats = await Promise.all(
    lines.map(async filePath => {
      try {
        return await statAsync(filePath)
      } catch {
        return null
      }
    }),
  )

  const sorted = lines
    .map((filePath, i) => [filePath, stats[i]] as const)
    .sort((a, b) => {
      const diff = (b[1]?.mtimeMs ?? 0) - (a[1]?.mtimeMs ?? 0)
      if (diff !== 0) return diff
      return a[0].localeCompare(b[0])
    })
    .map(([filePath]) => filePath)

  const window = paginate(sorted, appliedLimit, appliedOffset).map(
    toProjectRelativeIfPossible,
  )

  return {
    mode: 'files_with_matches',
    filenames: window,
    numFiles: window.length,
    ...(appliedLimit !== undefined ? { appliedLimit } : {}),
    ...(appliedOffset > 0 ? { appliedOffset } : {}),
    durationMs: Date.now() - start,
  }
}
