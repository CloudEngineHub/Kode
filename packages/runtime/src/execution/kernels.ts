import type {
  ExecutionDecision,
  ExecutionKernel,
  ExecutionRequest,
} from './types'
import { WindowsKernelPolicy } from './windowsKernelPolicy'

export class LocalExecutionKernel implements ExecutionKernel {
  readonly kind = 'local' as const

  assess(_request: ExecutionRequest): ExecutionDecision {
    return {
      allowed: true,
      kernel: this.kind,
      reason: 'allowed',
      requirements: [],
    }
  }
}

export class RemoteExecutionKernel implements ExecutionKernel {
  readonly kind = 'remote' as const

  constructor(
    private readonly options: {
      available: boolean
      stronglyIsolated: boolean
    },
  ) {}

  assess(request: ExecutionRequest): ExecutionDecision {
    if (!this.options.available) {
      return {
        allowed: false,
        kernel: this.kind,
        reason: 'remote_kernel_unavailable',
        requirements: ['remote_strongly_isolated_kernel'],
      }
    }
    const windowsRequiresIsolation =
      request.platform === 'win32' &&
      (request.writesFilesystem ||
        request.mode === 'background' ||
        request.mode === 'goal')
    if (
      (request.requireStrongIsolation === true || windowsRequiresIsolation) &&
      !this.options.stronglyIsolated
    ) {
      return {
        allowed: false,
        kernel: this.kind,
        reason: 'remote_kernel_not_strongly_isolated',
        requirements: ['remote_strongly_isolated_kernel'],
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

/** Selects a policy only; callers still own spawning and permission UX. */
export function selectExecutionKernel(args: {
  request: ExecutionRequest
  remote?: ExecutionKernel
}): ExecutionKernel {
  const platform = args.request.platform ?? process.platform
  if (platform === 'win32') {
    const policy = new WindowsKernelPolicy()
    const decision = policy.assess(args.request)
    if (!decision.allowed && args.remote) return args.remote
    return policy
  }
  return new LocalExecutionKernel()
}
