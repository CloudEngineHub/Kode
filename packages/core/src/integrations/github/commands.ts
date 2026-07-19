import type {
  GitHubRepository,
  PullRequestWatchTarget,
  ReadOnlyGhCommand,
  WorkflowRunWatchTarget,
} from './types'

const REPOSITORY_PART = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/
const PULL_REQUEST_JSON = [
  'number',
  'url',
  'state',
  'isDraft',
  'headRefName',
  'baseRefName',
  'mergeStateStatus',
  'reviewDecision',
  'statusCheckRollup',
  'updatedAt',
].join(',')
const CHECKS_JSON = ['name', 'state', 'bucket', 'link', 'workflow'].join(',')
const WORKFLOW_RUN_JSON = [
  'databaseId',
  'status',
  'conclusion',
  'url',
  'workflowName',
  'headSha',
  'updatedAt',
].join(',')

function assertRepositoryPart(value: string, field: string): string {
  const clean = String(value ?? '').trim()
  if (!REPOSITORY_PART.test(clean) || clean === '.' || clean === '..') {
    throw new Error(`Invalid GitHub ${field}.`)
  }
  return clean
}

function assertPositiveInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`GitHub ${field} must be a positive integer.`)
  }
  return value
}

export function normalizeGitHubRepository(
  repo: GitHubRepository,
): GitHubRepository {
  return {
    owner: assertRepositoryPart(repo.owner, 'owner'),
    repo: assertRepositoryPart(repo.repo, 'repository'),
  }
}

export function formatGitHubRepository(repo: GitHubRepository): string {
  const normalized = normalizeGitHubRepository(repo)
  return `${normalized.owner}/${normalized.repo}`
}

/**
 * Produces `gh pr view`; it has no mutation flags and is safe to schedule as a
 * polling probe after the caller has independently obtained user approval.
 */
export function createPullRequestWatchCommand(
  target: PullRequestWatchTarget,
): ReadOnlyGhCommand {
  const repo = formatGitHubRepository(target)
  const number = assertPositiveInteger(target.number, 'pull request number')
  return {
    command: 'gh',
    args: [
      'pr',
      'view',
      String(number),
      '--repo',
      repo,
      '--json',
      PULL_REQUEST_JSON,
    ],
    purpose: 'pull_request',
    readOnly: true,
  }
}

/** Returns a read-only CI check summary for a pull request. */
export function createPullRequestChecksWatchCommand(
  target: PullRequestWatchTarget,
): ReadOnlyGhCommand {
  const repo = formatGitHubRepository(target)
  const number = assertPositiveInteger(target.number, 'pull request number')
  return {
    command: 'gh',
    args: [
      'pr',
      'checks',
      String(number),
      '--repo',
      repo,
      '--json',
      CHECKS_JSON,
    ],
    purpose: 'checks',
    readOnly: true,
  }
}

/**
 * Uses explicit GET even though `gh api` defaults to GET. This makes a command
 * log auditably read-only and rejects accidental future mutation flags.
 */
export function createPullRequestReviewsWatchCommand(
  target: PullRequestWatchTarget,
): ReadOnlyGhCommand {
  const normalized = normalizeGitHubRepository(target)
  const number = assertPositiveInteger(target.number, 'pull request number')
  return {
    command: 'gh',
    args: [
      'api',
      '--method',
      'GET',
      '--paginate',
      `/repos/${normalized.owner}/${normalized.repo}/pulls/${number}/reviews`,
    ],
    purpose: 'reviews',
    readOnly: true,
  }
}

export function createWorkflowRunWatchCommand(
  target: WorkflowRunWatchTarget,
): ReadOnlyGhCommand {
  const repo = formatGitHubRepository(target)
  const runId = assertPositiveInteger(target.runId, 'workflow run id')
  return {
    command: 'gh',
    args: [
      'run',
      'view',
      String(runId),
      '--repo',
      repo,
      '--json',
      WORKFLOW_RUN_JSON,
    ],
    purpose: 'workflow_run',
    readOnly: true,
  }
}

export function createPullRequestWatcherCommands(
  target: PullRequestWatchTarget,
): readonly ReadOnlyGhCommand[] {
  return [
    createPullRequestWatchCommand(target),
    createPullRequestChecksWatchCommand(target),
    createPullRequestReviewsWatchCommand(target),
  ]
}

const MUTATING_ARGUMENTS = new Set([
  'create',
  'edit',
  'merge',
  'close',
  'reopen',
  'comment',
  'delete',
  'enable',
  'disable',
  'rerun',
  'cancel',
  'dispatch',
  'release',
])

/**
 * A final defense before an executor accepts a command from this factory. It
 * permits only the read subcommands emitted above and forbids body/field flags
 * that could turn `gh api` into a write.
 */
export function isReadOnlyGhCommand(command: {
  command: string
  args: readonly string[]
}): boolean {
  if (command.command !== 'gh' || command.args.length < 2) return false
  const args = command.args.map(value => String(value))
  if (args.some(arg => MUTATING_ARGUMENTS.has(arg.toLowerCase()))) return false
  if (
    args.some(arg =>
      ['--body', '--body-file', '--raw-field', '-f', '-F'].includes(arg),
    )
  ) {
    return false
  }

  if (args[0] === 'pr' && ['view', 'checks'].includes(args[1] ?? '')) {
    return true
  }
  if (args[0] === 'run' && args[1] === 'view') return true
  if (args[0] !== 'api') return false

  const methodIndex = args.findIndex(arg => arg === '--method')
  return methodIndex >= 0 && args[methodIndex + 1]?.toUpperCase() === 'GET'
}
