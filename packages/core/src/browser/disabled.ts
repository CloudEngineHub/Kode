import type { BrowserAdapter, BrowserRequest, BrowserResult } from './types'

class DisabledBrowserAdapter implements BrowserAdapter {
  readonly kind = 'disabled' as const
  readonly isAvailable = false

  async execute(request: BrowserRequest): Promise<BrowserResult> {
    return {
      ok: false,
      action: request.action,
      code: 'disabled',
      message: 'Browser automation is disabled.',
    }
  }
}

export function createDisabledBrowserAdapter(): BrowserAdapter {
  return new DisabledBrowserAdapter()
}
