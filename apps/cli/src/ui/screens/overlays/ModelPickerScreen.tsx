import React, { useCallback, useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import { getModelManager } from '#core/utils/model'
import { getTheme } from '#core/utils/theme'
import TextInput from '#ui-ink/components/TextInput'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'
import { PressableRow } from '#ui-ink/primitives/list/PressableRow'
import { useScopedIndexState } from '#ui-ink/hooks/useScopedIndexState'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatModelName(model: {
  name: string
  provider: string
  modelName: string
}): string {
  const provider = model.provider ? ` · ${model.provider}` : ''
  return `${model.name}${provider} · ${model.modelName}`
}

export function ModelPickerScreen({
  onDone,
  onSelectModel,
  onOpenModelConfig,
}: {
  onDone: () => void
  onSelectModel: (modelName: string) => void
  onOpenModelConfig?: () => void
}): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = { pending: false, keyName: null } as const

  const modelManager = useMemo(() => getModelManager(), [])
  const currentMainModelName = modelManager.getModelName('main')
  const models = useMemo(
    () =>
      [...modelManager.getAllConfiguredModels()].sort((left, right) => {
        const leftIsCurrent = left.modelName === currentMainModelName
        const rightIsCurrent = right.modelName === currentMainModelName
        if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1
        if (left.isActive !== right.isActive) return left.isActive ? -1 : 1
        const byLastUsed = (right.lastUsed ?? 0) - (left.lastUsed ?? 0)
        if (byLastUsed !== 0) return byLastUsed
        return left.name.localeCompare(right.name)
      }),
    [currentMainModelName, modelManager],
  )
  const [filterQuery, setFilterQuery] = useState('')
  const [filterCursorOffset, setFilterCursorOffset] = useState(0)
  const [filterOpen, setFilterOpen] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const normalizedFilter = filterQuery.trim().toLowerCase()
  const filteredModels = useMemo(() => {
    if (!normalizedFilter) return models
    return models.filter(model =>
      `${model.name} ${model.provider} ${model.modelName}`
        .toLowerCase()
        .includes(normalizedFilter),
    )
  }, [models, normalizedFilter])

  const initialIndex = useMemo(() => {
    if (!currentMainModelName) return 0
    const index = filteredModels.findIndex(
      model => model.modelName === currentMainModelName,
    )
    return index >= 0 ? index : 0
  }, [currentMainModelName, filteredModels])
  const [selectedIndex, setSelectedIndex] = useScopedIndexState({
    scope: 'model-picker',
    itemCount: filteredModels.length,
    initialIndex,
  })

  const activeModelCount = useMemo(
    () => models.filter(model => model.isActive).length,
    [models],
  )
  const reservedRows =
    (layout.tightLayout ? 7 : layout.compactLayout ? 9 : 11) +
    (filterOpen ? 2 : 0) +
    layout.paddingY * 2 +
    layout.gap * 3
  const maxVisible = Math.max(3, layout.rows - reservedRows)
  const window = useMemo(
    () =>
      getWindowedList({
        itemCount: filteredModels.length,
        focusIndex: selectedIndex,
        maxVisible,
        indicatorRows: 2,
      }),
    [filteredModels.length, maxVisible, selectedIndex],
  )
  const visibleModels = useMemo(
    () => filteredModels.slice(window.start, window.end),
    [filteredModels, window.end, window.start],
  )

  const updateFilter = useCallback(
    (nextValue: string) => {
      setFilterQuery(nextValue)
      setFilterCursorOffset(nextValue.length)
      setSelectedIndex(0)
      setStatus(null)
    },
    [setSelectedIndex],
  )

  const openModelConfig = useCallback(() => {
    if (!onOpenModelConfig) {
      setStatus('Use /model to add or edit model profiles')
      return false
    }
    onOpenModelConfig()
    return true
  }, [onOpenModelConfig])

  const selectModelAtIndex = useCallback(
    (index: number) => {
      const selected = filteredModels[index]
      setSelectedIndex(index)
      if (!selected) {
        setStatus(
          filteredModels.length === 0
            ? 'No matching models. Press Ctrl+O to configure one.'
            : 'Nothing selected',
        )
        return false
      }
      onSelectModel(selected.modelName)
      onDone()
      return true
    },
    [filteredModels, onDone, onSelectModel, setSelectedIndex],
  )

  const confirm = useCallback(() => {
    if (filteredModels.length === 0) {
      openModelConfig()
      return
    }
    selectModelAtIndex(selectedIndex)
  }, [
    filteredModels.length,
    openModelConfig,
    selectModelAtIndex,
    selectedIndex,
  ])

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''
      const lowerInputChar = inputChar.toLowerCase()
      const typedInput =
        key.insertable && !key.ctrl && !key.meta && input.length > 0
          ? input
          : ''

      if (key.ctrl && lowerInputChar === 'o') {
        openModelConfig()
        return true
      }

      if (
        (key.ctrl && lowerInputChar === 'c') ||
        (key.meta && lowerInputChar === 'p')
      ) {
        onDone()
        return true
      }

      if (key.escape) {
        if (filterOpen && filterQuery.length > 0) {
          updateFilter('')
          return true
        }
        if (filterOpen) {
          setFilterOpen(false)
          return true
        }
        onDone()
        return true
      }

      if (
        !filterOpen &&
        (typedInput === '/' || (key.ctrl && lowerInputChar === 'f'))
      ) {
        setFilterOpen(true)
        return true
      }

      if (filterOpen && (key.backspace || key.delete || typedInput)) {
        return false
      }

      if (key.return) {
        confirm()
        return true
      }

      if (key.upArrow || (!filterOpen && inputChar === 'k')) {
        setSelectedIndex(prev =>
          clamp(prev - 1, 0, Math.max(0, filteredModels.length - 1)),
        )
        return true
      }

      if (key.downArrow || (!filterOpen && inputChar === 'j')) {
        setSelectedIndex(prev =>
          clamp(prev + 1, 0, Math.max(0, filteredModels.length - 1)),
        )
        return true
      }

      if (!filterOpen && typedInput) {
        setFilterOpen(true)
        updateFilter(typedInput)
        return true
      }

      return
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  const currentModel = models.find(
    model => model.modelName === currentMainModelName,
  )
  const shortcutLine = filterOpen
    ? 'Type to filter · ↑/↓ select · Enter apply · Esc clear/back · Ctrl+O configure'
    : 'Type or / to filter · ↑/↓ or j/k select · Enter apply · Ctrl+O configure · Esc close'
  const statusText =
    status ??
    (models.length === 0
      ? 'No models configured. Press Enter or Ctrl+O to add one.'
      : filterOpen
        ? `${filteredModels.length} match${
            filteredModels.length === 1 ? '' : 'es'
          } · Enter applies the highlighted model`
        : `Current: ${
            currentModel ? formatModelName(currentModel) : '(not set)'
          } · ${activeModelCount}/${models.length} active`)
  const topIndicator = window.showUpIndicator
    ? `${figures.arrowUp} ${window.start} above`
    : ' '
  const bottomIndicator = window.showDownIndicator
    ? `${figures.arrowDown} ${filteredModels.length - window.end} below`
    : ' '

  return (
    <ScreenFrame
      title="Switch main model"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        <Text dimColor wrap="truncate-end">
          {shortcutLine}
        </Text>

        <Text
          color={
            models.length === 0 || filteredModels.length === 0
              ? theme.warning
              : theme.secondaryText
          }
          wrap="truncate-end"
        >
          {statusText}
        </Text>

        {filterOpen && (
          <Box flexDirection="row">
            <Text color={theme.kode}>Filter: </Text>
            <TextInput
              value={filterQuery}
              onChange={updateFilter}
              placeholder="model, provider, or ID"
              columns={Math.max(1, layout.columns - layout.paddingX * 2 - 8)}
              cursorOffset={filterCursorOffset}
              onChangeCursorOffset={setFilterCursorOffset}
              showCursor={true}
              focus={true}
              disableCursorMovementForUpDownKeys={true}
            />
          </Box>
        )}

        <Box flexDirection="column" width="100%">
          <Text dimColor wrap="truncate-end">
            {topIndicator}
          </Text>
          {visibleModels.length > 0 ? (
            visibleModels.map((model, index) => {
              const absoluteIndex = window.start + index
              const isSelected = absoluteIndex === selectedIndex
              const isCurrent = model.modelName === currentMainModelName
              const stateLabel = isCurrent
                ? 'current'
                : model.isActive
                  ? 'ready'
                  : 'inactive'
              const stateColor = isCurrent
                ? theme.kode
                : model.isActive
                  ? theme.secondaryText
                  : theme.warning

              return (
                <PressableRow
                  key={model.modelName}
                  width="100%"
                  onPress={() => selectModelAtIndex(absoluteIndex)}
                >
                  <Text color={isSelected ? theme.kode : theme.secondaryText}>
                    {isSelected ? figures.pointer : ' '}
                  </Text>
                  <Box flexGrow={1} overflow="hidden">
                    <Text
                      color={isSelected ? theme.text : theme.secondaryText}
                      bold={isSelected || isCurrent}
                      wrap="truncate-end"
                    >
                      {` ${formatModelName(model)}`}
                    </Text>
                  </Box>
                  <Text color={stateColor} wrap="truncate-end">
                    {` [${stateLabel}]`}
                  </Text>
                </PressableRow>
              )
            })
          ) : (
            <Text color={theme.warning} wrap="truncate-end">
              No matching models. Press Ctrl+O to configure one.
            </Text>
          )}
          <Text dimColor wrap="truncate-end">
            {bottomIndicator}
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
