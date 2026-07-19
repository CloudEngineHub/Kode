export type ExecutionMode = 'foreground' | 'background' | 'goal'

export type ExecutionRequest = {
  command: string
  cwd: string
  mode: ExecutionMode
  writesFilesystem: boolean
  approvalGranted?: boolean
  managedWorktree?: boolean
  requireStrongIsolation?: boolean
  platform?: NodeJS.Platform
}

export type ExecutionDecision = {
  allowed: boolean
  kernel: 'local' | 'remote' | 'windows-policy'
  reason:
    | 'allowed'
    | 'windows_readonly_foreground_only'
    | 'windows_requires_remote_isolation'
    | 'remote_kernel_unavailable'
    | 'remote_kernel_not_strongly_isolated'
  requirements: string[]
}

export interface ExecutionKernel {
  readonly kind: 'local' | 'remote' | 'windows-policy'
  assess(request: ExecutionRequest): ExecutionDecision
}
