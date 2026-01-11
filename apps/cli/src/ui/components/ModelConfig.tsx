import { Box, Text } from 'ink'
import * as React from 'react'
import { useState, useCallback } from 'react'
import figures from 'figures'
import { getTheme } from '#core/utils/theme'
import {
  getGlobalConfig,
  ModelPointerType,
  setModelPointer,
} from '#core/utils/config'
import { getModelManager, reloadModelManager } from '#core/utils/model'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { ModelListManager } from './ModelListManager'

type Props = {
  onClose: () => void
}

type ModelPointerSetting = {
  id: ModelPointerType | 'add-new'
  label: string
  description: string
  value: string
  options: Array<{ id: string; name: string }>
  type: 'modelPointer' | 'action'
  onChange(value?: string): void
}

export function ModelConfig({ onClose }: Props): React.ReactNode {
  const config = getGlobalConfig()
  const theme = getTheme()
  const { rows: terminalRows } = useTerminalSize()
  const tightLayout = terminalRows <= 18
  const compactLayout = terminalRows <= 22
  const containerPaddingY = tightLayout || compactLayout ? 0 : 1
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showModelListManager, setShowModelListManager] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [isDeleteMode, setIsDeleteMode] = useState(false)

  const modelManager = getModelManager()

  // Get available models for cycling (memoized) - without "Add New Model" option
  const availableModels = React.useMemo((): Array<{
    id: string
    name: string
  }> => {
    const profiles = modelManager.getAvailableModels()
    return profiles.map(p => ({ id: p.modelName, name: p.name }))
  }, [modelManager, refreshKey]) // 依赖refreshKey来强制更新

  // Create menu items: model pointers + "Add New Model" as separate item
  const menuItems = React.useMemo(() => {
    const modelSettings: ModelPointerSetting[] = [
      {
        id: 'main',
        label: 'Main Model',
        description: 'Primary model for general tasks and conversations',
        value: config.modelPointers?.main || '',
        options: availableModels,
        type: 'modelPointer' as const,
        onChange: (value: string) => handleModelPointerChange('main', value),
      },
      {
        id: 'task',
        label: 'Task Model',
        description: 'Model for TaskTool sub-agents and automation',
        value: config.modelPointers?.task || '',
        options: availableModels,
        type: 'modelPointer' as const,
        onChange: (value: string) => handleModelPointerChange('task', value),
      },
      {
        id: 'compact',
        label: 'Compact Model',
        description:
          'Model used for context compression when nearing the context window',
        value: config.modelPointers?.compact || '',
        options: availableModels,
        type: 'modelPointer' as const,
        onChange: (value: string) => handleModelPointerChange('compact', value),
      },
      {
        id: 'quick',
        label: 'Quick Model',
        description: 'Fast model for simple operations and utilities',
        value: config.modelPointers?.quick || '',
        options: availableModels,
        type: 'modelPointer' as const,
        onChange: (value: string) => handleModelPointerChange('quick', value),
      },
    ]

    // Add menu actions as separate menu items
    return [
      ...modelSettings,
      {
        id: 'manage-models',
        label: 'Manage Model List',
        description: 'View, add, and delete model configurations',
        value: '',
        options: [],
        type: 'action' as const,
        onChange: () => handleManageModels(),
      },
    ]
  }, [config.modelPointers, availableModels, refreshKey])

  const handleModelPointerChange = (
    pointer: ModelPointerType,
    modelId: string,
  ) => {
    // Direct model assignment
    setModelPointer(pointer, modelId)
    reloadModelManager()
    // Force re-render to show updated assignment
    setRefreshKey(prev => prev + 1)
  }

  const handleManageModels = () => {
    // Launch ModelListManager for model library management
    setShowModelListManager(true)
  }

  const handleModelConfigurationComplete = () => {
    // Model configuration is complete, return to model config screen
    setShowModelListManager(false)
    // 触发组件刷新，重新加载可用模型列表
    setRefreshKey(prev => prev + 1)
    // 将焦点重置到 "Manage Model Library" 选项
    const manageIndex = menuItems.findIndex(item => item.id === 'manage-models')
    if (manageIndex !== -1) {
      setSelectedIndex(manageIndex)
    }
  }

  // Handle keyboard input
  const handleInput = useCallback(
    (input: string, key: any) => {
      if (key.escape) {
        if (isDeleteMode) {
          setIsDeleteMode(false) // Exit delete mode
        } else {
          onClose()
        }
        return true
      } else if (input === 'd' && !isDeleteMode) {
        setIsDeleteMode(true) // Enter delete mode
        return true
      } else if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1))
        return true
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(menuItems.length - 1, prev + 1))
        return true
      } else if (key.return || input === ' ') {
        const setting = menuItems[selectedIndex]

        if (isDeleteMode && setting.type === 'modelPointer' && setting.value) {
          // Delete mode: clear the pointer assignment (not delete the model config)
          setModelPointer(setting.id as ModelPointerType, '')
          reloadModelManager()
          setRefreshKey(prev => prev + 1)
          setIsDeleteMode(false) // Exit delete mode after clearing assignment
          return true
        } else if (setting.type === 'modelPointer') {
          // Normal mode: cycle through available models
          if (setting.options.length === 0) {
            // No models available, redirect to model library management
            handleManageModels()
            return true
          }
          const currentIndex = setting.options.findIndex(
            opt => opt.id === setting.value,
          )
          const nextIndex = (currentIndex + 1) % setting.options.length
          const nextOption = setting.options[nextIndex]
          if (nextOption) {
            setting.onChange(nextOption.id)
          }
          return true
        } else if (setting.type === 'action') {
          // Execute action (like "Add New Model")
          setting.onChange()
          return true
        }
      }
    },
    [selectedIndex, menuItems, onClose, isDeleteMode, modelManager],
  )

  useKeypress(handleInput, {
    isActive: !showModelListManager,
  })

  // If showing ModelListManager, render it directly
  if (showModelListManager) {
    return <ModelListManager onClose={handleModelConfigurationComplete} />
  }

  // Main configuration screen - completely following Config component layout
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.secondaryBorder}
      width="100%"
      paddingX={2}
      paddingY={containerPaddingY}
    >
      <Box
        flexDirection="column"
        minHeight={2}
        marginBottom={tightLayout ? 0 : 1}
      >
        <Text bold>
          Model Configuration{isDeleteMode ? ' - CLEAR MODE' : ''}
        </Text>
        <Text dimColor>
          {isDeleteMode
            ? 'Press Enter/Space to clear selected pointer assignment, Esc to cancel'
            : availableModels.length === 0
              ? 'No models configured. Use "Configure New Model" to add your first model.'
              : 'Configure which models to use for different tasks. Space to cycle, Enter to configure.'}
        </Text>
      </Box>

      {menuItems.map((setting, i) => {
        const isSelected = i === selectedIndex
        let displayValue = ''
        let actionText = ''

        if (setting.type === 'modelPointer') {
          const currentModel = setting.options.find(
            opt => opt.id === setting.value,
          )
          displayValue = currentModel?.name || '(not configured)'
          actionText = isSelected ? ' [Space to cycle]' : ''
        } else if (setting.type === 'action') {
          displayValue = ''
          actionText = isSelected ? ' [Enter to configure]' : ''
        }

        return (
          <Box key={setting.id} flexDirection="column">
            <Box>
              <Box width={44}>
                <Text color={isSelected ? 'blue' : undefined}>
                  {isSelected ? figures.pointer : ' '} {setting.label}
                </Text>
              </Box>
              <Box>
                {setting.type === 'modelPointer' && (
                  <Text
                    color={
                      displayValue !== '(not configured)'
                        ? theme.success
                        : theme.warning
                    }
                  >
                    {displayValue}
                  </Text>
                )}
                {actionText && <Text color="blue">{actionText}</Text>}
              </Box>
            </Box>
            {isSelected && !tightLayout && (
              <Box paddingLeft={2} marginBottom={1}>
                <Text dimColor>{setting.description}</Text>
              </Box>
            )}
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
          {isDeleteMode
            ? 'CLEAR MODE: Press Enter/Space to clear assignment, Esc to cancel'
            : availableModels.length === 0
              ? 'Use ↑/↓ to navigate, Enter to configure new model, Esc to exit'
              : 'Use ↑/↓ to navigate, Space to cycle models, Enter to configure, d to clear, Esc to exit'}
        </Text>
      </Box>
    </Box>
  )
}
