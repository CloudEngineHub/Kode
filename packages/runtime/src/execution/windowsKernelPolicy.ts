import type {
  ExecutionDecision,
  ExecutionKernel,
  ExecutionRequest,
} from './types'

/**
 * Windows does not have an in-process equivalent of bwrap/sandbox-exec here.
 * This policy intentionally does not claim that a PowerShell child process is
 * isolated. Any unattended or write-capable execution must be sent to a
 * strongly-isolated external kernel (WSL2/VM/MCP worker).
 */
export class WindowsKernelPolicy implements ExecutionKernel {
  readonly kind = 'windows-policy' as const

  assess(request: ExecutionRequest): ExecutionDecision {
    const platform = request.platform ?? process.platform
    if (platform !== 'win32') {
      return {
        allowed: true,
        kernel: this.kind,
        reason: 'allowed',
        requirements: [],
      }
    }

    const requiresIsolation =
      request.requireStrongIsolation === true ||
      request.writesFilesystem ||
      request.mode === 'background' ||
      request.mode === 'goal'
    if (requiresIsolation) {
      return {
        allowed: false,
        kernel: this.kind,
        reason: 'windows_requires_remote_isolation',
        requirements: [
          'remote_strongly_isolated_kernel',
          'managed_worktree',
          'explicit_approval',
        ],
      }
    }

    if (!request.approvalGranted) {
      return {
        allowed: false,
        kernel: this.kind,
        reason: 'windows_readonly_foreground_only',
        requirements: ['explicit_approval'],
      }
    }
    return {
      allowed: true,
      kernel: this.kind,
      reason: 'allowed',
      requirements: [],
    }
  }
}

export function assessWindowsExecution(
  request: ExecutionRequest,
): ExecutionDecision {
  return new WindowsKernelPolicy().assess(request)
}
