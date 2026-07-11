import type { Command } from '../types'
import { listDurableRuns, reconcileDurableRuns } from '#core/runs'

const runs = {
  type: 'local',
  name: 'runs',
  description: 'Inspect or reconcile durable background runs',
  argumentHint: 'status | reconcile',
  isEnabled: true,
  isHidden: false,
  disableNonInteractive: true,
  async call(args) {
    const subcommand = args.trim()
    if (subcommand === 'status') {
      const items = listDurableRuns()
      if (items.length === 0) return 'No durable runs found.'
      return items
        .map(item => `${item.id}  ${item.kind}  ${item.status}  ${item.cwd}`)
        .join('\n')
    }
    if (subcommand === 'reconcile') {
      const items = reconcileDurableRuns()
      if (items.length === 0) return 'No durable runs found to reconcile.'
      return items
        .map(item => `${item.run.id}  ${item.action}  ${item.run.status}`)
        .join('\n')
    }
    return 'Usage: /runs status | /runs reconcile'
  },
  userFacingName() {
    return 'runs'
  },
} satisfies Command

export default runs
