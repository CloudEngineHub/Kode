import type { Command } from '../types'
import { getTodoRenderModel } from '#core/utils/todoRenderModel'
import { getTodos } from '#core/utils/todoStorage'
import { Box, Text } from 'ink'
import * as React from 'react'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

function TodosView({
  agentId,
  onClose,
}: {
  agentId?: string
  onClose: () => void
}): React.ReactNode {
  useKeypress((input, key) => {
    if (key.escape || (key.ctrl && (input === 'c' || input === 'd'))) {
      onClose()
      return true
    }
  })

  const todos = getTodos(agentId)
  const model = getTodoRenderModel(todos)

  if (model.kind === 'empty') {
    return <Text>{model.message}</Text>
  }

  const count = model.items.length
  const label = count === 1 ? 'todo' : 'todos'

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>
          {count} {label}
        </Text>
        <Text>:</Text>
      </Text>
      <Box marginTop={1} flexDirection="column">
        {model.items.map((item, index) => (
          <Box key={index} flexDirection="row">
            <Text dimColor={item.checkboxDim}>{item.checkbox} </Text>
            <Text
              bold={item.contentBold}
              dimColor={item.contentDim}
              strikethrough={item.contentStrikethrough}
            >
              {item.content}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

const todos = {
  type: 'local-jsx',
  name: 'todos',
  description: 'List current todo items',
  isEnabled: true,
  isHidden: false,
  ui: { displayMode: 'fullscreen' },
  async call(onDone, context) {
    return <TodosView agentId={context.agentId} onClose={onDone} />
  },
  userFacingName() {
    return 'todos'
  },
} satisfies Command

export default todos
export { TodosView as TodosViewForTests }
