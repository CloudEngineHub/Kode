export type DurableRunKind = 'shell' | 'agent' | 'goal'
export type DurableRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'orphaned'
  | 'interrupted'

export type DurableRunProcessIdentity = {
  pid: number
  /** OS-provided process-start token; required before a shell run can be tailed after restart. */
  startToken: string
}

export type DurableRun = {
  version: 1
  id: string
  kind: DurableRunKind
  status: DurableRunStatus
  cwd: string
  command?: string
  sessionId?: string
  goalId?: string
  worktreeId?: string
  outputFile?: string
  process?: DurableRunProcessIdentity
  createdAt: number
  updatedAt: number
  heartbeatAt: number
  finishedAt?: number
  error?: string
}

export type CreateDurableRunArgs = {
  id?: string
  kind: DurableRunKind
  cwd: string
  command?: string
  sessionId?: string
  goalId?: string
  worktreeId?: string
  outputFile?: string
  process?: DurableRunProcessIdentity
  storageRoot?: string
  now?: number
}

export type DurableRunProbe = (identity: DurableRunProcessIdentity) => {
  alive: boolean
  startToken?: string
}

export type ReconciledDurableRun = {
  run: DurableRun
  action: 'tail_only' | 'requeueable' | 'orphaned' | 'unchanged'
}
