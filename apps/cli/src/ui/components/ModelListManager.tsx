import { Box, Text } from 'ink'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import figures from 'figures'
import { getTheme } from '#core/utils/theme'
import {
  getGlobalConfigCached,
  type ModelPointerType,
  type ModelProfile,
} from '#core/utils/config'
import { getModelManager } from '#core/utils/model'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getWindowedList } from '#ui-ink/primitives/list/windowedList'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { ModelSelector } from './ModelSelector'

type Props = {
  onClose: () => void
}

export function ModelListManager({ onClose }: Props): React.ReactNode {
  const config = getGlobalConfigCached()
  const theme = getTheme()
  const layout = useScreenLayout()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [editingModelProfile, setEditingModelProfile] =
    useState<ModelProfile | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const exitState = useExitOnCtrlCD(onClose)

  const modelManager = getModelManager()
  const availableModels = modelManager.getAvailableModels()

  function getModelUsage(modelName: string): ModelPointerType[] {
    const usage: ModelPointerType[] = []
    const pointers: ModelPointerType[] = ['main', 'task', 'compact', 'quick']

    pointers.forEach(pointer => {
      if (config.modelPointers?.[pointer] === modelName) {
        usage.push(pointer)
      }
    })

    return usage
  }

  const menuItems = useMemo(() => {
    const modelItems = availableModels.map(model => ({
      id: model.modelName,
      name: model.name,
      provider: model.provider,
      usedBy: getModelUsage(model.modelName),
      type: 'model' as const,
    }))

    return [
      {
        id: 'add-new',
        name: '+ Add New Model',
        provider: '',
        usedBy: [],
        type: 'action' as const,
      },
      ...modelItems,
    ]
  }, [availableModels, config.modelPointers, refreshKey])

  useEffect(() => {
    setSelectedIndex(prev => {
      if (menuItems.length === 0) return 0
      return Math.max(0, Math.min(prev, menuItems.length - 1))
    })
  }, [menuItems.length])

  const handleDeleteModel = useCallback(
    (modelName: string) => {
      modelManager.removeModel(modelName)
      setRefreshKey(prev => prev + 1)
      setDeleteConfirmId(null)
      setStatus('Deleted model; pointers were reassigned if needed')
    },
    [modelManager],
  )

  const handleAddNewModel = () => {
    setEditingModelProfile(null)
    setShowModelSelector(true)
  }

  const handleModelConfigurationComplete = () => {
    setShowModelSelector(false)
    setEditingModelProfile(null)
    setRefreshKey(prev => prev + 1)
  }

  const reservedLines =
    (layout.tightLayout ? 9 : layout.compactLayout ? 11 : 13) +
    layout.paddingY * 2 +
    layout.gap * 4
  const maxVisible = Math.max(3, layout.rows - reservedLines - 1)

  const window = useMemo(
    () =>
      getWindowedList({
        itemCount: menuItems.length,
        focusIndex: selectedIndex,
        maxVisible,
        indicatorRows: 2,
      }),
    [maxVisible, menuItems.length, selectedIndex],
  )

  const visibleItems = useMemo(
    () => menuItems.slice(window.start, window.end),
    [menuItems, window.end, window.start],
  )

  const handleInput = useCallback(
    (input: string, key: any) => {
      const inputChar = input.length === 1 ? input : ''

      if (key.escape) {
        if (deleteConfirmId) {
          setDeleteConfirmId(null)
          setStatus('Cancelled delete')
          return true
        }
        onClose()
        return true
      }

      const isUp = key.upArrow || inputChar === 'k'
      const isDown = key.downArrow || inputChar === 'j'

      if (isUp) {
        setSelectedIndex(prev => Math.max(0, prev - 1))
        setDeleteConfirmId(null)
        return true
      }

      if (isDown) {
        setSelectedIndex(prev => Math.min(menuItems.length - 1, prev + 1))
        setDeleteConfirmId(null)
        return true
      }

      if (key.pageUp) {
        setSelectedIndex(prev => Math.max(0, prev - window.visibleCount))
        setDeleteConfirmId(null)
        return true
      }

      if (key.pageDown) {
        setSelectedIndex(prev =>
          Math.min(menuItems.length - 1, prev + window.visibleCount),
        )
        setDeleteConfirmId(null)
        return true
      }

      if (key.home || inputChar === 'g') {
        setSelectedIndex(0)
        setDeleteConfirmId(null)
        return true
      }

      if (key.end || inputChar === 'G') {
        setSelectedIndex(Math.max(0, menuItems.length - 1))
        setDeleteConfirmId(null)
        return true
      }

      if (inputChar === 'd') {
        const item = menuItems[selectedIndex]
        if (!item || item.type !== 'model') {
          setStatus('Select a model to delete')
          return true
        }

        setDeleteConfirmId(item.id)
        setStatus(
          `Delete "${item.name}"? Press Enter to confirm, Esc to cancel`,
        )
        return true
      }

      if (key.return || inputChar === ' ') {
        const item = menuItems[selectedIndex]
        if (!item) return true

        if (
          deleteConfirmId &&
          item.type === 'model' &&
          item.id === deleteConfirmId
        ) {
          handleDeleteModel(item.id)
          return true
        }

        if (item.type === 'action') {
          handleAddNewModel()
          return true
        }

        const modelProfile = availableModels.find(m => m.modelName === item.id)
        if (modelProfile) {
          setEditingModelProfile(modelProfile)
          setShowModelSelector(true)
          setDeleteConfirmId(null)
        }
        return true
      }
    },
    [
      availableModels,
      deleteConfirmId,
      handleDeleteModel,
      menuItems,
      onClose,
      selectedIndex,
      window.visibleCount,
    ],
  )

  useKeypress(handleInput, {
    isActive: !showModelSelector,
    priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY,
  })

  if (showModelSelector) {
    return (
      <ModelSelector
        onDone={handleModelConfigurationComplete}
        onCancel={handleModelConfigurationComplete}
        skipModelType={true}
        isOnboarding={false}
        abortController={new AbortController()}
        initialModelProfile={editingModelProfile ?? undefined}
      />
    )
  }

  const selectedItem = menuItems[selectedIndex]
  const selectedModel =
    selectedItem?.type === 'model'
      ? (availableModels.find(m => m.modelName === selectedItem.id) ?? null)
      : null

  const details = (() => {
    if (!selectedItem) return null
    if (selectedItem.type === 'action') {
      return (
        <Text dimColor wrap="truncate-end">
          Add a new model profile (provider + credentials + model name).
        </Text>
      )
    }

    const usedBy =
      selectedModel && selectedItem.usedBy.length > 0
        ? `Pointers: ${selectedItem.usedBy.join(', ')}`
        : 'Pointers: (not assigned)'

    return (
      <Box flexDirection="column">
        <Text dimColor wrap="truncate-end">
          Provider: {selectedItem.provider || '(unknown)'} - {usedBy}
        </Text>
        <Text dimColor wrap="truncate-end">
          Model ID: {selectedItem.id}
        </Text>
      </Box>
    )
  })()

  const topIndicator = window.showUpIndicator ? `${figures.arrowUp} More` : ' '
  const bottomIndicator = window.showDownIndicator
    ? `${figures.arrowDown} More`
    : ' '
  const statusLine =
    status ??
    (deleteConfirmId ? 'Delete pending' : `Models: ${availableModels.length}`)

  return (
    <ScreenFrame
      title="Model Library"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        <Text dimColor wrap="truncate-end">
          Add, edit, remove, and inspect model profiles. Use /model to set
          pointers (main/task/compact/quick).
        </Text>

        <Text
          color={deleteConfirmId ? theme.error : theme.secondaryText}
          wrap="truncate-end"
        >
          {statusLine}
        </Text>

        <Box flexDirection="column" width="100%">
          <Text dimColor wrap="truncate-end">
            {topIndicator}
          </Text>
          {visibleItems.map((item, idx) => {
            const absoluteIndex = window.start + idx
            const isSelected = absoluteIndex === selectedIndex
            const isDeleteConfirm =
              deleteConfirmId &&
              item.type === 'model' &&
              item.id === deleteConfirmId

            const pointerColor = isDeleteConfirm
              ? theme.error
              : isSelected
                ? theme.kode
                : theme.secondaryText

            const labelColor = isDeleteConfirm
              ? theme.error
              : isSelected
                ? theme.text
                : theme.secondaryText

            const availability =
              item.type === 'model'
                ? item.usedBy.length > 0
                  ? `Active: ${item.usedBy.join(', ')}`
                  : 'Available'
                : ''

            return (
              <Box key={item.id} flexDirection="row" gap={1}>
                <Text color={pointerColor}>
                  {isSelected ? figures.pointer : ' '}
                </Text>
                <Box flexGrow={1}>
                  <Text
                    color={labelColor}
                    bold={isSelected}
                    wrap="truncate-end"
                  >
                    {item.name}
                  </Text>
                </Box>
                {item.type === 'model' ? (
                  <Box flexDirection="row" gap={1} flexShrink={0}>
                    {item.provider ? (
                      <Text
                        color={theme.secondaryText}
                        wrap="truncate-end"
                      >{`(${item.provider})`}</Text>
                    ) : null}
                    <Text
                      color={
                        item.usedBy.length > 0
                          ? theme.success
                          : theme.secondaryText
                      }
                      wrap="truncate-end"
                    >
                      {availability}
                    </Text>
                  </Box>
                ) : isSelected ? (
                  <Text color={theme.suggestion} wrap="truncate-end">
                    Enter to add
                  </Text>
                ) : null}
              </Box>
            )
          })}
          <Text dimColor wrap="truncate-end">
            {bottomIndicator}
          </Text>
        </Box>

        {details ? <Box paddingLeft={2}>{details}</Box> : null}

        <Box marginTop={layout.tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            Up/Down or j/k - PgUp/PgDn - Home/End - Enter add/edit - d delete -
            Esc close
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
