import type { PreToolUseHookOutcome } from '#core/hooks/types'
import { splitCommand } from '#core/utils/commands'
import { workspaceSafetyService } from '#core/services/workspaceSafety'
import { parse } from 'shell-quote'
import { resolve as resolvePath } from 'node:path'

function parseBoolLike(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(
    normalized,
  )
}

function isEnvAssignment(token: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*=/.test(token)
}

function tokenizeCommand(segment: string): string[] {
  const tokens: string[] = []
  const parsed = parse(segment, varName => `$${varName}`)
  for (const part of parsed) {
    if (typeof part === 'string') {
      const trimmed = part.trim()
      if (trimmed) tokens.push(trimmed)
      continue
    }
    if (
      part &&
      typeof part === 'object' &&
      'op' in part &&
      part.op === 'glob'
    ) {
      const pattern =
        'pattern' in part && typeof part.pattern === 'string'
          ? part.pattern
          : ''
      if (pattern) tokens.push(pattern)
    }
  }
  return tokens
}

function skipWrapperCommands(tokens: string[], startIndex: number): number {
  let i = startIndex
  for (;;) {
    const token = tokens[i]
    if (!token) return i

    if (token === 'sudo') {
      i += 1
      while (tokens[i] && tokens[i].startsWith('-')) {
        // best-effort: handle `sudo -u user ...`
        if (tokens[i] === '-u' || tokens[i] === '-g' || tokens[i] === '-h') {
          i += 2
          continue
        }
        i += 1
      }
      continue
    }

    if (token === 'env') {
      i += 1
      while (tokens[i]) {
        const t = tokens[i]
        if (t === '-u' || t === '--unset') {
          i += 2
          continue
        }
        if (t.startsWith('-')) {
          i += 1
          continue
        }
        if (isEnvAssignment(t)) {
          i += 1
          continue
        }
        break
      }
      continue
    }

    if (token === 'command' || token === 'builtin') {
      i += 1
      while (tokens[i] && tokens[i].startsWith('-')) i += 1
      continue
    }

    return i
  }
}

function skipGitGlobalOptions(tokens: string[], startIndex: number): number {
  let i = startIndex
  while (tokens[i] && tokens[i].startsWith('-')) {
    const t = tokens[i]
    if (t === '--') return i + 1
    if (
      t === '-C' ||
      t === '-c' ||
      t === '--work-tree' ||
      t === '--git-dir' ||
      t === '--namespace'
    ) {
      i += 2
      continue
    }
    i += 1
  }
  return i
}

function getGitBranchSwitchTargetCwd(
  segment: string,
  cwd: string,
): string | null {
  const tokens = tokenizeCommand(segment)
  if (tokens.length === 0) return null

  let i = 0
  while (tokens[i] && isEnvAssignment(tokens[i])) i += 1
  i = skipWrapperCommands(tokens, i)

  if (tokens[i] !== 'git') return null

  let targetCwd = cwd
  for (let opt = i + 1; tokens[opt] && tokens[opt].startsWith('-'); ) {
    const t = tokens[opt]
    if (t === '--') break

    if (t === '-C' && typeof tokens[opt + 1] === 'string') {
      targetCwd = resolvePath(cwd, tokens[opt + 1] ?? '')
      opt += 2
      continue
    }

    // Best-effort skip other global options.
    if (
      t === '-c' ||
      t === '--work-tree' ||
      t === '--git-dir' ||
      t === '--namespace'
    ) {
      opt += 2
      continue
    }

    opt += 1
  }

  const subIndex = skipGitGlobalOptions(tokens, i + 1)
  const subcommand = tokens[subIndex]
  if (!subcommand) return null
  if (subcommand === 'switch') return targetCwd
  if (subcommand !== 'checkout') return null

  // Strict safety rule: only allow `git checkout` when `--` is explicitly
  // present (pathspec delimiter). Otherwise treat as a branch/HEAD change.
  return !tokens.slice(subIndex + 1).includes('--') ? targetCwd : null
}

export function runBuiltinPreToolUseGuards(args: {
  toolName: string
  toolInput: Record<string, unknown>
  cwd: string
}): PreToolUseHookOutcome | null {
  if (args.toolName !== 'Bash') return null
  if (parseBoolLike(process.env.KODE_DISABLE_GIT_BRANCH_GUARD)) return null

  const command =
    typeof args.toolInput.command === 'string' ? args.toolInput.command : ''
  if (!command.trim()) return null

  const segments = splitCommand(command)
  const targets = new Set<string>()
  for (const segment of segments) {
    const target = getGitBranchSwitchTargetCwd(segment, args.cwd)
    if (target) targets.add(target)
  }
  if (targets.size === 0) return null

  // Escape hatch for intentional branch switches.
  if (parseBoolLike(process.env.KODE_ALLOW_GIT_BRANCH_SWITCH)) return null

  let peers: ReturnType<typeof workspaceSafetyService.listActivePeers> = []
  let peerWorkspaceCwd = args.cwd
  for (const targetCwd of targets) {
    const found = workspaceSafetyService.listActivePeers({ cwd: targetCwd })
    if (found.length === 0) continue
    peers = found
    peerWorkspaceCwd = targetCwd
    break
  }
  if (peers.length === 0) return null

  const peerSummary = peers
    .slice(0, 5)
    .map(p => {
      const agent = p.agentId ? `agentId=${p.agentId}` : `pid=${p.pid}`
      const branch = p.branch ? ` branch=${p.branch}` : ''
      return `- ${agent}${branch}`
    })
    .join('\n')

  return {
    kind: 'block',
    message:
      'Blocked potentially disruptive git branch switch in a shared worktree.\n\n' +
      `Target worktree: ${peerWorkspaceCwd}\n\n` +
      'Detected other active agents in this workspace:\n' +
      (peerSummary || '- (unknown)') +
      '\n\n' +
      'To proceed safely:\n' +
      '- Prefer a separate worktree (git worktree add ...) for parallel agents, or\n' +
      '- Re-run with KODE_ALLOW_GIT_BRANCH_SWITCH=1 if you are sure this will not disrupt other work.',
  }
}
