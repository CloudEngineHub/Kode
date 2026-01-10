export type BashGateFindingSeverity = 'high' | 'medium'

export type BashGateFindingCategory =
  | 'fs_delete'
  | 'fs_write'
  | 'privilege'
  | 'remote_exec'
  | 'persistence'
  | 'credentials'
  | 'git_data_loss'
  | 'infra_destroy'
  | 'container'
  | 'system'
  | 'process'
  | 'network'
  | 'pkg'
  | 'obfuscation'

export type BashGateFinding = {
  code: string
  severity: BashGateFindingSeverity
  category: BashGateFindingCategory
  title: string
  evidence?: string
}

export type SimpleRule = {
  code: string
  severity: BashGateFindingSeverity
  category: BashGateFindingCategory
  title: string
  patterns: RegExp[]
  evidence?: (m: RegExpMatchArray) => string
}

function addUnique(
  findings: BashGateFinding[],
  finding: BashGateFinding,
): void {
  if (findings.some(f => f.code === finding.code)) return
  findings.push(finding)
}

function applySimpleRules(
  command: string,
  rules: SimpleRule[],
): BashGateFinding[] {
  const findings: BashGateFinding[] = []
  for (const rule of rules) {
    for (const re of rule.patterns) {
      const m = command.match(re)
      if (!m) continue
      addUnique(findings, {
        code: rule.code,
        severity: rule.severity,
        category: rule.category,
        title: rule.title,
        ...(rule.evidence ? { evidence: rule.evidence(m).slice(0, 200) } : {}),
      })
      break
    }
  }
  return findings
}

function analyzeRm(command: string): BashGateFinding[] {
  const findings: BashGateFinding[] = []
  if (!/(^|[;&|()\s])rm(\s|$)/.test(command)) return findings

  addUnique(findings, {
    code: 'FS_RM_ANY',
    severity: 'medium',
    category: 'fs_delete',
    title: 'rm deletes files/directories',
  })

  if (/\s-rf(\s|$)/i.test(command) || /\s-fR(\s|$)/i.test(command)) {
    addUnique(findings, {
      code: 'FS_RM_FORCE_RECURSIVE',
      severity: 'medium',
      category: 'fs_delete',
      title: 'rm uses force+recursive flags (high data-loss risk)',
    })
  }

  const criticalTargets = [
    { re: /(^|\s)\/(\s|$)/, label: '/' },
    { re: /(^|\s)~(\/|\s|$)/, label: '~' },
    { re: /(^|\s)\.(\s|$)/, label: '.' },
    { re: /(^|\s)\.\.(\s|$)/, label: '..' },
    {
      re: /(^|\s)\/(etc|bin|sbin|usr|var|lib|proc|sys)(\/|\s|$)/,
      label: '/(etc|bin|sbin|usr|var|lib|proc|sys)',
    },
  ]
  for (const t of criticalTargets) {
    if (t.re.test(command)) {
      addUnique(findings, {
        code: 'FS_RM_CRITICAL_TARGET',
        severity: 'high',
        category: 'fs_delete',
        title: 'rm targets a critical path',
        evidence: t.label,
      })
      break
    }
  }

  if (
    /[^\n]*\*/.test(command) ||
    /[^\n]*\?/.test(command) ||
    /[^\n]*\{/.test(command)
  ) {
    addUnique(findings, {
      code: 'FS_RM_GLOB',
      severity: 'medium',
      category: 'fs_delete',
      title: 'rm uses glob/expansion patterns (wider blast radius)',
    })
  }

  return findings
}

function analyzeGit(command: string): BashGateFinding[] {
  const findings: BashGateFinding[] = []
  if (!/(^|[;&|()\s])git(\s|$)/.test(command)) return findings

  const dataLossOps: Array<{ code: string; title: string; re: RegExp }> = [
    {
      code: 'GIT_CHECKOUT',
      title: 'git checkout can discard working changes',
      re: /\bgit\b[^\n]*\bcheckout\b/i,
    },
    {
      code: 'GIT_RESTORE',
      title: 'git restore can discard working changes',
      re: /\bgit\b[^\n]*\brestore\b/i,
    },
    {
      code: 'GIT_RESET',
      title: 'git reset can discard commits/changes',
      re: /\bgit\b[^\n]*\breset\b/i,
    },
    {
      code: 'GIT_RESET_HARD',
      title: 'git reset --hard discards local changes',
      re: /\bgit\b[^\n]*\breset\b[^\n]*--hard\b/i,
    },
    {
      code: 'GIT_CLEAN',
      title: 'git clean deletes untracked files',
      re: /\bgit\b[^\n]*\bclean\b/i,
    },
    {
      code: 'GIT_CLEAN_FDX',
      title: 'git clean -fdx deletes untracked + ignored files',
      re: /\bgit\b[^\n]*\bclean\b[^\n]*-(?:[^\n]*f[^\n]*d|[^\n]*d[^\n]*f)[^\n]*x/i,
    },
    {
      code: 'GIT_PUSH_FORCE',
      title: 'git push --force rewrites remote history',
      re: /\bgit\b[^\n]*\bpush\b[^\n]*(--force|--force-with-lease|\s-f(\s|$))/i,
    },
    {
      code: 'GIT_PUSH_DELETE',
      title: 'git push --delete deletes remote refs',
      re: /\bgit\b[^\n]*\bpush\b[^\n]*(--delete|:\S+)/i,
    },
    {
      code: 'GIT_FILTER_REWRITE',
      title: 'history rewrite (filter-branch/filter-repo/rebase/amend)',
      re: /\bgit\b[^\n]*\b(filter-branch|filter-repo|rebase|commit\b[^\n]*--amend)\b/i,
    },
    {
      code: 'GIT_RECOVERY_REDUCE',
      title: 'reduces recoverability (reflog expire / gc --prune=now)',
      re: /\bgit\b[^\n]*\b(reflog\b[^\n]*expire|gc\b[^\n]*--prune=now)\b/i,
    },
    {
      code: 'GIT_STASH_DROP',
      title: 'stash drop/clear removes saved work',
      re: /\bgit\b[^\n]*\bstash\b[^\n]*\b(drop|clear)\b/i,
    },
  ]

  for (const op of dataLossOps) {
    if (!op.re.test(command)) continue
    addUnique(findings, {
      code: op.code,
      severity: 'medium',
      category: 'git_data_loss',
      title: op.title,
    })
  }

  return findings
}

import { SIMPLE_RULES } from './bashGateSimpleRules'

export function getBashGateFindings(command: string): BashGateFinding[] {
  const c = command.trim()
  if (!c) return []
  const findings = [
    ...analyzeRm(c),
    ...analyzeGit(c),
    ...applySimpleRules(c, SIMPLE_RULES),
  ]

  // Deterministic ordering (stable prompts/dumps).
  findings.sort((a, b) => a.code.localeCompare(b.code))
  return findings
}

export function shouldReviewBashCommand(findings: BashGateFinding[]): boolean {
  // Unified policy: any high-severity signal requires LLM review.
  return findings.some(f => f.severity === 'high')
}
