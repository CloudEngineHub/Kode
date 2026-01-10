import type { XiDecision } from './types'
import { createXiContext } from './xiContext'
import { xiAllowChecks, xiAskChecks } from './xiChecks'

export function xi(command: string): XiDecision {
  const ctx = createXiContext(command)

  for (const check of xiAllowChecks) {
    const res = check(ctx)
    if (res.behavior === 'allow') {
      return {
        behavior: 'passthrough',
        message: res.message || 'Command allowed',
      }
    }
    if (res.behavior === 'ask') return res
  }

  for (const check of xiAskChecks) {
    const res = check(ctx)
    if (res.behavior === 'ask') return res
  }

  return {
    behavior: 'passthrough',
    message: 'Command passed all security checks',
  }
}
