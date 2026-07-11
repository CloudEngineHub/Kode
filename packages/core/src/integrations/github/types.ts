export type GitHubRepository = {
  owner: string
  repo: string
}

export type PullRequestWatchTarget = GitHubRepository & {
  number: number
}

export type WorkflowRunWatchTarget = GitHubRepository & {
  runId: number
}

/** A command description only. This module never starts a child process. */
export type ReadOnlyGhCommand = {
  command: 'gh'
  args: readonly string[]
  purpose: 'pull_request' | 'checks' | 'reviews' | 'workflow_run'
  readOnly: true
}
