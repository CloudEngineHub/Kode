import type { Command } from '../types'

const rewind = {
  type: 'local',
  name: 'rewind',
  aliases: ['checkpoint'],
  description: 'Restore the conversation to a previous point',
  isEnabled: true,
  isHidden: false,
  disableNonInteractive: true,
  async call(_args, context) {
    const open = context.options?.openMessageSelector
    if (!open) return 'Rewind is only available in interactive mode.'
    open()
    return ''
  },
  userFacingName() {
    return 'rewind'
  },
} satisfies Command

export default rewind
