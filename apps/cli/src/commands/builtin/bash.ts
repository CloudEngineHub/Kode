import type { Command } from '../types'

const bash = {
  type: 'local',
  name: 'bash',
  description: 'Run a shell command from the prompt',
  argumentHint: '<command>',
  isEnabled: true,
  isHidden: false,
  disableNonInteractive: true,
  userFacingName() {
    return 'bash'
  },
  async call() {
    return 'Use /bash <command> directly in the prompt.'
  },
} satisfies Command

export default bash
