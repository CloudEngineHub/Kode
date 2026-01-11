import { Box, Text } from 'ink'
import * as React from 'react'
import { useState, useCallback } from 'react'
import figures from 'figures'
import { getTheme } from '#core/utils/theme'
import { getGlobalConfig, ModelPointerType } from '#core/utils/config'
import { getModelManager } from '#core/utils/model'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { ModelSelector } from './ModelSelector'

type Props = {
  onClose: () => void
}

export function ModelListManager({ onClose }: Props): React.ReactNode {
  const config = getGlobalConfig()
  const theme = getTheme()
  const { rows: terminalRows } = useTerminalSize()
  const tightLayout = terminalRows <= 18
  const compactLayout = terminalRows <= 22
  const containerPaddingY = tightLayout || compactLayout ? 0 : 1
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const exitState = useExitOnCtrlCD(onClose)

  const modelManager = getModelManager()
  const availableModels = modelManager.getAvailableModels()

  // Create menu items: existing models + "Add New Model"
  const menuItems = React.useMemo(() => {
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

  React.useEffect(() => {
    setSelectedIndex(prev => {
      if (menuItems.length === 0) return 0
      return Math.max(0, Math.min(prev, menuItems.length - 1))
    })
  }, [menuItems.length])

  // Check which pointers are using this model
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

  const handleDeleteModel = (modelName: string) => {
    // Remove the model
    modelManager.removeModel(modelName)

    // The removeModel function should already clear the pointers,
    // but let's ensure UI refreshes
    setRefreshKey(prev => prev + 1)
    setIsDeleteMode(false)
  }

  const handleAddNewModel = () => {
    setShowModelSelector(true)
  }

  const handleModelConfigurationComplete = () => {
    setShowModelSelector(false)
    setRefreshKey(prev => prev + 1)
  }

  const maxVisibleItems = React.useMemo(() => {
    // Keep one spare line to reduce the chance of Ink scrolling/tearing in short terminals.
    const safeRows = Math.max(1, terminalRows)
    const reserved =
      2 + // border top/bottom
      containerPaddingY * 2 +
      2 + // header (title + hint)
      (tightLayout ? 2 : 3) // footer (separator + instructions; a bit more breathing room)

    return Math.max(1, safeRows - reserved - 1)
  }, [containerPaddingY, terminalRows, tightLayout])

  const windowedMenuItems = React.useMemo(() => {
    if (menuItems.length <= maxVisibleItems) {
      return { start: 0, end: menuItems.length, items: menuItems }
    }

    const visibleCount = Math.max(
      1,
      Math.min(maxVisibleItems, menuItems.length),
    )
    const half = Math.floor(visibleCount / 2)
    const start = Math.max(
      0,
      Math.min(
        selectedIndex - half,
        Math.max(0, menuItems.length - visibleCount),
      ),
    )
    const end = Math.min(menuItems.length, start + visibleCount)
    return { start, end, items: menuItems.slice(start, end) }
  }, [maxVisibleItems, menuItems, selectedIndex])

  // Handle keyboard input
  const handleInput = useCallback(
    (input: string, key: any) => {
      if (key.escape) {
        if (isDeleteMode) {
          setIsDeleteMode(false)
        } else {
          onClose()
        }
        return true
      } else if (input === 'd' && !isDeleteMode && availableModels.length > 1) {
        setIsDeleteMode(true)
        return true
      } else if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1))
        return true
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(menuItems.length - 1, prev + 1))
        return true
      } else if (key.return || input === ' ') {
        const item = menuItems[selectedIndex]

        if (isDeleteMode && item.type === 'model') {
          // Prevent deleting the last model
          if (availableModels.length <= 1) {
            setIsDeleteMode(false) // Exit delete mode
            return true
          }
          // Prevent deleting model that is currently set as main
          if (config.modelPointers?.main === item.id) {
            setIsDeleteMode(false) // Exit delete mode
            return true
          }
          handleDeleteModel(item.id)
          return true
        } else if (item.type === 'action') {
          handleAddNewModel()
          return true
        }
        // Note: Remove any pointer switching functionality here
        return true
      }
    },
    [selectedIndex, menuItems, onClose, isDeleteMode, availableModels.length],
  )

  useKeypress(handleInput, { isActive: !showModelSelector })

  // If showing ModelSelector, render it directly
  if (showModelSelector) {
    return (
      <ModelSelector
        onDone={handleModelConfigurationComplete}
        onCancel={handleModelConfigurationComplete}
        skipModelType={true}
        isOnboarding={false}
        abortController={new AbortController()}
      />
    )
  }

  // Main model list screen
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isDeleteMode ? 'red' : theme.secondaryBorder}
      width="100%"
      paddingX={2}
      paddingY={containerPaddingY}
    >
      <Box
        flexDirection="column"
        minHeight={2}
        marginBottom={tightLayout ? 0 : 1}
      >
        <Text bold color={isDeleteMode ? 'red' : undefined}>
          Manage Model List{isDeleteMode ? ' - DELETE MODE' : ''}
          {menuItems.length > windowedMenuItems.items.length
            ? ` (${windowedMenuItems.start + 1}-${windowedMenuItems.end}/${menuItems.length})`
            : ''}
          {exitState.pending
            ? ` (press ${exitState.keyName} again to exit)`
            : ''}
        </Text>
        <Text dimColor>
          {isDeleteMode ? (
            availableModels.length <= 1 ? (
              'Cannot delete the last model, Esc to cancel'
            ) : (
              'Press Enter/Space to DELETE selected model (cannot delete main), Esc to cancel'
            )
          ) : (
            <>
              Navigate: ↑↓ | Select: Enter |{' '}
              <Text bold color="red">
                Delete: d
              </Text>{' '}
              | Exit: Esc
            </>
          )}
        </Text>
      </Box>

      {windowedMenuItems.items.map((item, windowIndex) => {
        const i = windowedMenuItems.start + windowIndex
        const isSelected = i === selectedIndex

        return (
          <Box key={item.id} flexDirection="column">
            <Box flexDirection="row">
              <Box width={50}>
                <Text
                  color={
                    isSelected ? (isDeleteMode ? 'red' : 'blue') : undefined
                  }
                >
                  {isSelected ? figures.pointer : ' '} {item.name}
                </Text>
              </Box>
              <Box>
                {item.type === 'model' && (
                  <>
                    <Text color={theme.secondaryText}>({item.provider})</Text>
                    {item.usedBy.length > 0 && (
                      <Box marginLeft={1}>
                        <Text color={theme.success}>
                          [Active: {item.usedBy.join(', ')}]
                        </Text>
                      </Box>
                    )}
                    {item.usedBy.length === 0 && (
                      <Box marginLeft={1}>
                        <Text color={theme.secondaryText}>[Available]</Text>
                      </Box>
                    )}
                  </>
                )}
                {item.type === 'action' && (
                  <Text color={theme.suggestion}>
                    {isSelected ? '[Press Enter to add new model]' : ''}
                  </Text>
                )}
              </Box>
            </Box>
          </Box>
        )
      })}

      <Box
        marginTop={tightLayout ? 0 : 1}
        paddingTop={tightLayout ? 0 : 1}
        borderTopColor={theme.secondaryBorder}
        borderStyle="single"
        borderTop
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
      >
        <Text dimColor>
          {isDeleteMode ? (
            availableModels.length <= 1 ? (
              'Cannot delete the last model - press Esc to cancel'
            ) : (
              'DELETE MODE: Press Enter/Space to delete (cannot delete main model), Esc to cancel'
            )
          ) : availableModels.length <= 1 ? (
            'Use ↑/↓ to navigate, Enter to add new, Esc to exit (cannot delete last model)'
          ) : (
            <>
              Use ↑/↓ to navigate,{' '}
              <Text bold color="red">
                d to delete model
              </Text>
              , Enter to add new, Esc to exit
            </>
          )}
        </Text>
      </Box>
    </Box>
  )
}
