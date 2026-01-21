import React, { useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import { getTodoRenderModel } from '#core/utils/todoRenderModel'
import { getTodos } from '#core/utils/todoStorage'
import { getTheme } from '#core/utils/theme'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'

function TodosEmptyView({
  message,
  onClose,
  exitState,
  layout,
}: {
  message: string
  onClose: () => void
  exitState: React.ComponentProps<typeof ScreenFrame>['exitState']
  layout: ReturnType<typeof useScreenLayout>
}): React.ReactNode {
  useKeypress(
    (input, key) => {
      if (
        key.escape ||
        (key.ctrl && input === 'c') ||
        (key.ctrl && input === 't')
      ) {
        onClose()
        return true
      }
    },
    { priority: 10 },
  )

  return (
    <ScreenFrame
      title="Todos"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        <Text dimColor>{message}</Text>
        <Text dimColor wrap="truncate-end">
          Esc or Ctrl+C to close
        </Text>
      </Box>
    </ScreenFrame>
  )
}

function TodosListView({
  items,
  count,
  label,
  exitState,
  onClose,
}: {
  items: Array<{
    checkbox: '☐' | '☒'
    checkboxDim: boolean
    content: string
    contentBold: boolean
    contentDim: boolean
    contentStrikethrough: boolean
  }>
  count: number
  label: string
  exitState: React.ComponentProps<typeof ScreenFrame>['exitState']
  onClose: () => void
}): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const reservedLines =
    (layout.tightLayout ? 7 : layout.compactLayout ? 9 : 11) +
    layout.paddingY * 2 +
    layout.gap * 3
  const maxVisible = Math.max(3, layout.rows - reservedLines - 1)
  const window = useMemo(
    () =>
      getWindowedList({
        itemCount: items.length,
        focusIndex: selectedIndex,
        maxVisible,
        indicatorRows: 2,
      }),
    [items.length, maxVisible, selectedIndex],
  )

  const visibleItems = useMemo(
    () => items.slice(window.start, window.end),
    [items, window.end, window.start],
  )

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''

      if (
        key.escape ||
        (key.ctrl && input === 'c') ||
        (key.ctrl && input === 't')
      ) {
        onClose()
        return true
      }

      if (key.upArrow || inputChar === 'k') {
        setSelectedIndex(prev => Math.max(0, prev - 1))
        return true
      }
      if (key.downArrow || inputChar === 'j') {
        setSelectedIndex(prev => Math.min(items.length - 1, prev + 1))
        return true
      }

      if (key.pageUp) {
        setSelectedIndex(prev => Math.max(0, prev - window.visibleCount))
        return true
      }
      if (key.pageDown) {
        setSelectedIndex(prev =>
          Math.min(items.length - 1, prev + window.visibleCount),
        )
        return true
      }

      if (key.home || inputChar === 'g') {
        setSelectedIndex(0)
        return true
      }
      if (key.end || inputChar === 'G') {
        setSelectedIndex(Math.max(0, items.length - 1))
        return true
      }
    },
    { priority: 10 },
  )

  return (
    <ScreenFrame
      title="Todos"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        <Text dimColor wrap="truncate-end">
          {count} {label}:
        </Text>

        <Box flexDirection="column" width="100%">
          <Text dimColor wrap="truncate-end">
            {window.showUpIndicator ? `${figures.arrowUp} More` : ' '}
          </Text>
          {visibleItems.map((item, idx) => {
            const absoluteIndex = window.start + idx
            const isSelected = absoluteIndex === selectedIndex
            return (
              <Box key={absoluteIndex} flexDirection="row" gap={1}>
                <Text color={isSelected ? theme.kode : theme.secondaryText}>
                  {isSelected ? figures.pointer : ' '}
                </Text>
                <Text dimColor={item.checkboxDim}>{item.checkbox}</Text>
                <Text
                  bold={item.contentBold || isSelected}
                  dimColor={item.contentDim && !isSelected}
                  strikethrough={item.contentStrikethrough}
                  color={isSelected ? theme.text : undefined}
                  wrap="truncate-end"
                >
                  {item.content.replace(/\s+/g, ' ')}
                </Text>
              </Box>
            )
          })}
          <Text dimColor wrap="truncate-end">
            {window.showDownIndicator ? `${figures.arrowDown} More` : ' '}
          </Text>
        </Box>

        <Text dimColor wrap="truncate-end">
          ↑/↓ or j/k · PgUp/PgDn · Home/End · Esc/Ctrl+C close
        </Text>
      </Box>
    </ScreenFrame>
  )
}

export function TodosScreen({
  agentId,
  onDone,
}: {
  agentId?: string
  onDone: () => void
}): React.ReactNode {
  const layout = useScreenLayout()
  const exitState = { pending: false, keyName: null } as const

  const todos = getTodos(agentId)
  const model = getTodoRenderModel(todos)

  if (model.kind === 'empty') {
    return (
      <TodosEmptyView
        message={model.message}
        onClose={onDone}
        exitState={exitState}
        layout={layout}
      />
    )
  }

  const count = model.items.length
  const label = count === 1 ? 'todo' : 'todos'

  return (
    <TodosListView
      items={model.items}
      count={count}
      label={label}
      exitState={exitState}
      onClose={onDone}
    />
  )
}
