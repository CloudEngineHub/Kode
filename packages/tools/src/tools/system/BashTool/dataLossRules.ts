import { parse, type ParseEntry } from 'shell-quote'

// ============================================
// Types
// ============================================

export type BashGateFinding = {
  code: string
  severity: 'high'
  category: string
  title: string
  evidence?: string
}

type CommandContext = {
  command: string
  tokens: string[]
  args: string[]
  flags: Set<string>
}

type BashGateRule = {
  id: string
  category: string
  title: string
  tokens: string[]
  validate?: (ctx: CommandContext) => boolean
}

// ============================================
// Declarative Rules - Only HIGH severity (triggers LLM Gate)
// ============================================

const BASH_GATE_RULES: BashGateRule[] = [
  // Git permanent data loss
  {
    id: 'GIT_RESET_HARD',
    category: 'git',
    title: 'git reset --hard discards uncommitted changes permanently',
    tokens: ['git', 'reset'],
    validate: ctx => ctx.flags.has('--hard'),
  },
  {
    id: 'GIT_CLEAN_FD',
    category: 'git',
    title: 'git clean -fd deletes untracked files permanently',
    tokens: ['git', 'clean'],
    validate: ctx =>
      ctx.flags.has('-f') || ctx.args.some(a => /^-[a-z]*f/i.test(a)),
  },
  {
    id: 'GIT_PUSH_FORCE',
    category: 'git',
    title: 'git push --force rewrites remote history permanently',
    tokens: ['git', 'push'],
    validate: ctx =>
      ctx.flags.has('--force') ||
      ctx.flags.has('--force-with-lease') ||
      ctx.args.some(a => /^-[a-z]*f$/i.test(a)),
  },
  {
    id: 'GIT_STASH_DROP',
    category: 'git',
    title: 'git stash drop/clear removes saved work permanently',
    tokens: ['git', 'stash'],
    validate: ctx => ctx.args.some(a => /^(drop|clear)$/i.test(a)),
  },
  {
    id: 'GIT_REFLOG_EXPIRE',
    category: 'git',
    title: 'git reflog expire reduces recoverability permanently',
    tokens: ['git', 'reflog', 'expire'],
  },
  {
    id: 'GIT_GC_PRUNE',
    category: 'git',
    title: 'git gc --prune=now reduces recoverability permanently',
    tokens: ['git', 'gc'],
    validate: ctx => ctx.args.some(a => /^--prune=now$/i.test(a)),
  },

  // Filesystem destruction
  {
    id: 'FS_MKFS',
    category: 'filesystem',
    title: 'mkfs formats filesystem (irreversible data loss)',
    tokens: ['mkfs'],
  },
  {
    id: 'FS_WIPE',
    category: 'filesystem',
    title: 'secure wipe destroys data permanently',
    tokens: ['shred'],
  },
  {
    id: 'FS_WIPEFS',
    category: 'filesystem',
    title: 'wipefs removes filesystem signatures',
    tokens: ['wipefs'],
  },
  {
    id: 'FS_BLKDISCARD',
    category: 'filesystem',
    title: 'blkdiscard discards device data',
    tokens: ['blkdiscard'],
  },
  {
    id: 'FS_DD_DEV',
    category: 'filesystem',
    title: 'dd overwrites device (potential data destruction)',
    tokens: ['dd'],
    validate: ctx => ctx.args.some(a => /^of=\/dev\//i.test(a)),
  },

  // Infrastructure destruction
  {
    id: 'INFRA_TERRAFORM_DESTROY',
    category: 'infrastructure',
    title: 'terraform destroy destroys infrastructure permanently',
    tokens: ['terraform', 'destroy'],
  },
  {
    id: 'INFRA_KUBECTL_DELETE',
    category: 'infrastructure',
    title: 'kubectl delete removes cluster resources',
    tokens: ['kubectl', 'delete'],
  },
  {
    id: 'INFRA_PULUMI_DESTROY',
    category: 'infrastructure',
    title: 'pulumi destroy destroys stack permanently',
    tokens: ['pulumi', 'destroy'],
  },
]

// ============================================
// Command Parser
// ============================================

function tokensToStrings(entries: ParseEntry[]): string[] {
  const result: string[] = []
  for (const entry of entries) {
    if (typeof entry === 'string') {
      result.push(entry)
    } else if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>
      if (record.op === 'glob' && typeof record.pattern === 'string') {
        result.push(record.pattern)
      }
    }
  }
  return result
}

function splitByOperators(entries: ParseEntry[]): ParseEntry[][] {
  const commands: ParseEntry[][] = []
  let current: ParseEntry[] = []

  for (const entry of entries) {
    if (typeof entry === 'object' && entry !== null) {
      const record = entry as Record<string, unknown>
      const op = record.op
      if (op === ';' || op === '&&' || op === '||' || op === '|') {
        if (current.length > 0) {
          commands.push(current)
          current = []
        }
        continue
      }
    }
    current.push(entry)
  }

  if (current.length > 0) {
    commands.push(current)
  }

  return commands
}

function isNonExecutableSubcommand(tokens: string[]): boolean {
  if (tokens.length === 0) return true
  const first = tokens[0]?.toLowerCase()
  // Skip echo/printf (just printing strings)
  if (first === 'echo' || first === 'printf') return true
  // Skip grep/cat/head/tail (just reading)
  if (['grep', 'cat', 'head', 'tail', 'less', 'more'].includes(first ?? ''))
    return true
  return false
}

function parseCommand(command: string): CommandContext[] {
  const trimmed = command.trim()
  // Skip comments
  if (trimmed.startsWith('#')) return []

  let parsed: ParseEntry[]
  try {
    parsed = parse(command, varName => `$${varName}`)
  } catch {
    // Fallback to simple token split if parse fails
    const tokens = command.split(/\s+/).filter(Boolean)
    if (isNonExecutableSubcommand(tokens)) return []
    return [buildContext(command, tokens)]
  }

  const subcommands = splitByOperators(parsed)
  const contexts: CommandContext[] = []

  for (const sub of subcommands) {
    const tokens = tokensToStrings(sub)
    // Skip non-executable subcommands (echo, grep, etc.)
    if (isNonExecutableSubcommand(tokens)) continue
    contexts.push(buildContext(command, tokens))
  }

  return contexts
}

function buildContext(command: string, tokens: string[]): CommandContext {
  const flags = new Set<string>()
  const args: string[] = []

  for (const token of tokens) {
    if (token.startsWith('--')) {
      flags.add(token.split('=')[0]!)
    } else if (token.startsWith('-') && token.length > 1) {
      // Handle combined short flags like -rf
      flags.add(token)
      // Also add individual flags
      for (let i = 1; i < token.length; i++) {
        if (token[i] !== '=') {
          flags.add(`-${token[i]}`)
        }
      }
    }
    args.push(token)
  }

  return { command, tokens, args, flags }
}

// ============================================
// Rule Matching Engine
// ============================================

function matchTokenSequence(actual: string[], required: string[]): boolean {
  let ai = 0
  for (const req of required) {
    const reqLower = req.toLowerCase()
    let found = false
    while (ai < actual.length) {
      const actualLower = actual[ai]!.toLowerCase()
      // Handle mkfs.ext4 style commands
      if (actualLower === reqLower || actualLower.startsWith(`${reqLower}.`)) {
        found = true
        ai++
        break
      }
      ai++
    }
    if (!found) return false
  }
  return true
}

// ============================================
// rm Critical Target Detection (special handling)
// ============================================

function isCriticalRmTarget(args: string[]): {
  isCritical: boolean
  target?: string
} {
  const criticalPatterns = [
    { pattern: /^\/$/, label: '/' },
    { pattern: /^~\/?$/, label: '~' },
    { pattern: /^\.\/?$/, label: '.' },
    { pattern: /^\.\.\/?$/, label: '..' },
    // Only match direct system directories, not subdirectories
    // /etc is critical, /etc/nginx is not as critical
    // /var is critical, /var/folders/... (macOS tmp) is safe
    {
      pattern: /^\/(etc|bin|sbin|usr|lib|boot|root)\/?$/,
      label: 'system directory',
    },
  ]

  for (const arg of args) {
    if (arg.startsWith('-')) continue
    for (const { pattern, label } of criticalPatterns) {
      if (pattern.test(arg)) {
        return { isCritical: true, target: label }
      }
    }
  }
  return { isCritical: false }
}

function detectRmCritical(ctx: CommandContext): BashGateFinding | null {
  if (!ctx.tokens.some(t => t === 'rm' || t === 'rmdir')) {
    return null
  }

  const { isCritical, target } = isCriticalRmTarget(ctx.args)
  if (isCritical) {
    return {
      code: 'FS_RM_CRITICAL',
      severity: 'high',
      category: 'filesystem',
      title: `rm targets critical path (${target})`,
      evidence: target,
    }
  }

  return null
}

// ============================================
// Main Detection Function
// ============================================

export function getBashGateFindings(command: string): BashGateFinding[] {
  const contexts = parseCommand(command)
  const findings: BashGateFinding[] = []
  const seenIds = new Set<string>()

  for (const ctx of contexts) {
    // Check rm special case
    const rmFinding = detectRmCritical(ctx)
    if (rmFinding && !seenIds.has(rmFinding.code)) {
      seenIds.add(rmFinding.code)
      findings.push(rmFinding)
    }

    // Check declarative rules
    for (const rule of BASH_GATE_RULES) {
      if (seenIds.has(rule.id)) continue

      if (matchTokenSequence(ctx.tokens, rule.tokens)) {
        if (!rule.validate || rule.validate(ctx)) {
          seenIds.add(rule.id)
          findings.push({
            code: rule.id,
            severity: 'high',
            category: rule.category,
            title: rule.title,
          })
        }
      }
    }
  }

  return findings
}

export function shouldReviewBashCommand(findings: BashGateFinding[]): boolean {
  return findings.length > 0
}
