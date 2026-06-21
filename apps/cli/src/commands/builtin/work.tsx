import type { Command } from '../types'
import * as React from 'react'
import { WorkTasksScreen } from '#ui-ink/screens/overlays/WorkTasksScreen'

const work = {
  type: 'local-jsx',
  name: 'work',
  description: 'Show current work tasks',
  isEnabled: true,
  isHidden: false,
  aliases: ['todos', 'tasklist'],
  ui: { displayMode: 'fullscreen' },
  async call(onDone) {
    return <WorkTasksScreen onDone={onDone} />
  },
  userFacingName() {
    return 'work'
  },
} satisfies Command

export default work
export function WorkTasksViewForTests({ onClose }: { onClose: () => void }) {
  return <WorkTasksScreen onDone={onClose} />
}
