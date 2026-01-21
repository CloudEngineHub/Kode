import type { Command } from '../types'
import * as React from 'react'
import { TodosScreen } from '#ui-ink/screens/overlays/TodosScreen'

const todos = {
  type: 'local-jsx',
  name: 'todos',
  description: 'List current todo items',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  async call(onDone, context) {
    return <TodosScreen agentId={context.agentId} onDone={onDone} />
  },
  userFacingName() {
    return 'todos'
  },
} satisfies Command

export default todos
export function TodosViewForTests({
  agentId,
  onClose,
}: {
  agentId?: string
  onClose: () => void
}) {
  return <TodosScreen agentId={agentId} onDone={onClose} />
}
