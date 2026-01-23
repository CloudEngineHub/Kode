import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import { getModelManager } from '#core/utils/model'
import { getTheme } from '#core/utils/theme'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function ModelPickerScreen({
  onDone,
  onSelectModel,
}: {
  onDone: () => void
  onSelectModel: (modelName: string) => void
}): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = { pending: false, keyName: null } as const

  const modelManager = useMemo(() => getModelManager(), [])
  const currentMainModelName = modelManager.getModelName('main')
  const models = useMemo(
    () => modelManager.getAllConfiguredModels(),
    [modelManager],
  )

  const initialIndex = useMemo(() => {
    if (!currentMainModelName) return 0
    const idx = models.findIndex(m => m.modelName === currentMainModelName)
    return idx >= 0 ? idx : 0
  }, [currentMainModelName, models])

  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    setSelectedIndex(prev => clamp(prev, 0, Math.max(0, models.length - 1)))
  }, [models.length])

  const confirm = useCallback(() => {
    const selected = models[selectedIndex]
    if (!selected) {
      setStatus(
        models.length === 0 ? 'No models configured' : 'Nothing selected',
      )
      return
    }
    onSelectModel(selected.modelName)
    onDone()
  }, [models, onDone, onSelectModel, selectedIndex])

  useKeypress(
    (input, key) => {
      const inputChar = input.length === 1 ? input : ''

      if (
        key.escape ||
        (key.ctrl && inputChar === 'c') ||
        (key.meta && inputChar === 'p')
      ) {
        onDone()
        return true
      }

      if (key.return) {
        confirm()
        return true
      }

      if (key.upArrow || inputChar === 'k') {
        setSelectedIndex(prev =>
          clamp(prev - 1, 0, Math.max(0, models.length - 1)),
        )
        return true
      }

      if (key.downArrow || inputChar === 'j') {
        setSelectedIndex(prev =>
          clamp(prev + 1, 0, Math.max(0, models.length - 1)),
        )
        return true
      }

      return
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  const shortcutLine = '↑/↓ select · Enter apply · Esc/Ctrl+C close'

  return (
    <ScreenFrame
      title="Model Picker"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        <Text dimColor wrap="truncate-end">
          {shortcutLine}
        </Text>

        <Text dimColor wrap="truncate-end">
          {status ??
            (models.length > 0
              ? `Current: ${currentMainModelName ?? '(none)'}`
              : 'No models configured. Use /model to add models.')}
        </Text>

        <Box flexDirection="column">
          {models.length > 0 ? (
            models.slice(0, 16).map((model, idx) => {
              const isSelected = idx === selectedIndex
              const label = `${model.name} (${model.provider}) · ${model.modelName}${
                model.isActive ? '' : ' (inactive)'
              }`
              return (
                <Text
                  key={model.modelName}
                  color={isSelected ? theme.text : theme.secondaryText}
                  bold={isSelected}
                  wrap="truncate-end"
                >
                  {isSelected ? figures.pointer : ' '} {label}
                </Text>
              )
            })
          ) : (
            <Text dimColor>(empty)</Text>
          )}
        </Box>
      </Box>
    </ScreenFrame>
  )
}
