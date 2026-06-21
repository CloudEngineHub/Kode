import { Box, Text } from 'ink'
import * as React from 'react'
import { useCallback, useRef, useState } from 'react'
import figures from 'figures'
import { getTheme, type ThemeNames } from '#core/utils/theme'
import {
  GlobalConfig,
  saveGlobalConfig,
  getGlobalConfig,
} from '#core/utils/config'
import { getModelManager } from '#core/utils/model'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'

// All available themes
const THEME_OPTIONS: ThemeNames[] = [
  'light',
  'light-daltonized',
  'solarized-light',
  'github-light',
  'dark',
  'dark-daltonized',
  'dracula',
  'nord',
  'monokai',
  'tokyo-night',
  'catppuccin',
  'gruvbox',
  'one-dark',
  'solarized-dark',
]

type Props = {
  onClose: () => void
}

type Setting =
  | {
      id: string
      label: string
      value: boolean
      onChange(value: boolean): void
      type: 'boolean'
      disabled?: boolean
    }
  | {
      id: string
      label: string
      value: string
      options: string[]
      onChange(value: string): void
      type: 'enum'
      disabled?: boolean
    }
  | {
      id: string
      label: string
      value: string
      onChange(value: string): void
      type: 'string'
      disabled?: boolean
    }
  | {
      id: string
      label: string
      value: number
      onChange(value: number): void
      type: 'number'
      disabled?: boolean
    }

export function ConfigScreen({ onClose }: Props): React.ReactNode {
  const [globalConfig, setGlobalConfig] = useState(getGlobalConfig())
  const initialConfig = React.useRef(getGlobalConfig())
  const [selectedIndex, setSelectedIndex] = useState(0)
  const exitState = { pending: false, keyName: null } as const
  const [editingString, setEditingString] = useState(false)
  const [currentInput, setCurrentInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const didCloseRef = useRef(false)
  const { rows, columns } = useTerminalSize()
  const tightLayout = rows <= 18 || columns <= 72
  const compactLayout = tightLayout || rows <= 22
  const paddingY = tightLayout ? 0 : 1
  const gap = tightLayout ? 0 : 1
  const paddingX = tightLayout || compactLayout ? 1 : 2

  const modelManager = getModelManager()
  const activeProfiles = modelManager.getAvailableModels()

  const settings: Setting[] = [
    // Global settings
    {
      id: 'theme',
      label: 'Theme',
      value: globalConfig.theme ?? 'dark',
      options: THEME_OPTIONS,
      onChange(theme: string) {
        const themeName: ThemeNames = THEME_OPTIONS.includes(
          theme as ThemeNames,
        )
          ? (theme as ThemeNames)
          : 'dark'
        const config = { ...getGlobalConfig(), theme: themeName }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'enum',
    },
    {
      id: 'editorMode',
      label: 'Editor mode',
      value: globalConfig.editorMode ?? 'normal',
      options: ['normal', 'vim'],
      onChange(mode: string) {
        const editorMode: GlobalConfig['editorMode'] =
          mode === 'normal' || mode === 'vim' || mode === 'emacs'
            ? mode
            : 'normal'
        const config = { ...getGlobalConfig(), editorMode }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'enum',
    },
    {
      id: 'verbose',
      label: 'Verbose mode',
      value: globalConfig.verbose ?? false,
      onChange(verbose: boolean) {
        const config = { ...getGlobalConfig(), verbose }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'boolean',
    },
    {
      id: 'stream',
      label: 'Stream responses',
      value: globalConfig.stream ?? true,
      onChange(stream: boolean) {
        const config = { ...getGlobalConfig(), stream }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'boolean',
    },
    {
      id: 'thinkingMode',
      label: 'Thinking mode',
      value: globalConfig.thinkingMode ?? 'auto',
      options: ['auto', 'enabled', 'disabled'],
      onChange(mode: string) {
        const thinkingMode: GlobalConfig['thinkingMode'] =
          mode === 'auto' || mode === 'enabled' || mode === 'disabled'
            ? mode
            : 'auto'
        const config = { ...getGlobalConfig(), thinkingMode }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'enum',
    },
    {
      id: 'useAlternateBuffer',
      label: 'Use alternate buffer (restart required; disables scrollback)',
      value: globalConfig.useAlternateBuffer ?? false,
      onChange(useAlternateBuffer: boolean) {
        const config = { ...getGlobalConfig(), useAlternateBuffer }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'boolean',
    },
    {
      id: 'incrementalRendering',
      label: 'Incremental rendering (restart required; reduces flicker)',
      value: globalConfig.incrementalRendering ?? true,
      onChange(incrementalRendering: boolean) {
        const config = { ...getGlobalConfig(), incrementalRendering }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'boolean',
    },
    {
      id: 'wipeScrollbackOnClear',
      label: 'Wipe scrollback on /clear',
      value: globalConfig.wipeScrollbackOnClear ?? false,
      onChange(wipeScrollbackOnClear: boolean) {
        const config = { ...getGlobalConfig(), wipeScrollbackOnClear }
        saveGlobalConfig(config)
        setGlobalConfig(config)
      },
      type: 'boolean',
    },
  ]

  const theme = getTheme()

  const safeOnClose = useCallback(() => {
    if (didCloseRef.current) return
    didCloseRef.current = true
    onClose()
  }, [onClose])

  useKeypress(
    (input, key) => {
      if (didCloseRef.current) return true

      const inputChar = input.length === 1 ? input : ''

      if (editingString) {
        if (key.return) {
          const currentSetting = settings[selectedIndex]
          if (!currentSetting) return

          if (currentSetting.type === 'string') {
            try {
              currentSetting.onChange(currentInput)
              setEditingString(false)
              setCurrentInput('')
              setInputError(null)
            } catch (error) {
              setInputError(
                error instanceof Error ? error.message : 'Invalid input',
              )
            }
          } else if (currentSetting.type === 'number') {
            const numValue = parseFloat(currentInput)
            if (isNaN(numValue)) {
              setInputError('Please enter a valid number')
            } else {
              try {
                currentSetting.onChange(numValue)
                setEditingString(false)
                setCurrentInput('')
                setInputError(null)
              } catch (error) {
                setInputError(
                  error instanceof Error ? error.message : 'Invalid input',
                )
              }
            }
          }
        } else if (key.escape || (key.ctrl && inputChar === 'c')) {
          setEditingString(false)
          setCurrentInput('')
          setInputError(null)
        } else if (key.delete || key.backspace) {
          setCurrentInput(prev => prev.slice(0, -1))
        } else if (input) {
          setCurrentInput(prev => prev + input)
        }
        return
      }

      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1))
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(settings.length - 1, prev + 1))
      } else if (inputChar === 'k' || inputChar === 'j') {
        const delta = inputChar === 'k' ? -1 : 1
        setSelectedIndex(prev =>
          Math.max(0, Math.min(settings.length - 1, prev + delta)),
        )
      } else if (key.home || inputChar === 'g') {
        setSelectedIndex(0)
      } else if (key.end || inputChar === 'G') {
        setSelectedIndex(Math.max(0, settings.length - 1))
      } else if (key.return) {
        const currentSetting = settings[selectedIndex]
        if (currentSetting?.disabled) return

        if (currentSetting?.type === 'boolean') {
          currentSetting.onChange(!currentSetting.value)
        } else if (currentSetting?.type === 'enum') {
          const currentIndex = currentSetting.options.indexOf(
            currentSetting.value,
          )
          const nextIndex = (currentIndex + 1) % currentSetting.options.length
          currentSetting.onChange(currentSetting.options[nextIndex])
        } else if (
          currentSetting?.type === 'string' ||
          currentSetting?.type === 'number'
        ) {
          setCurrentInput(String(currentSetting.value))
          setEditingString(true)
          setInputError(null)
        }
      } else if (key.escape || (key.ctrl && inputChar === 'c')) {
        // Check if config has changed
        const currentConfigString = JSON.stringify(getGlobalConfig())
        const initialConfigString = JSON.stringify(initialConfig.current)

        if (currentConfigString !== initialConfigString) {
          // Config has changed, save it
          saveGlobalConfig(getGlobalConfig())
        }

        safeOnClose()
      }
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  const modelSummary = (() => {
    if (activeProfiles.length === 0) {
      return (
        <Text color={theme.secondaryText} wrap="truncate-end">
          No models configured. Use <Text color={theme.suggestion}>/model</Text>{' '}
          to add models.
        </Text>
      )
    }

    const reservedRows =
      (tightLayout ? 10 : compactLayout ? 12 : 14) + paddingY * 2 + gap * 4
    const maxVisible = Math.max(0, rows - reservedRows)
    const visible = activeProfiles.slice(
      0,
      Math.max(1, Math.min(6, maxVisible)),
    )
    const hidden = Math.max(0, activeProfiles.length - visible.length)

    return (
      <Box flexDirection="column" gap={0}>
        {visible.map(profile => (
          <Text
            key={profile.modelName}
            color={theme.secondaryText}
            wrap="truncate-end"
          >
            • {profile.name} ({profile.provider})
          </Text>
        ))}
        {hidden > 0 ? (
          <Text color={theme.secondaryText} wrap="truncate-end">
            … and {hidden} more
          </Text>
        ) : null}
        <Text color={theme.suggestion} wrap="truncate-end">
          Use /model to manage model configurations
        </Text>
      </Box>
    )
  })()

  return (
    <ScreenFrame
      title="Configuration"
      exitState={exitState}
      paddingX={paddingX}
      paddingY={paddingY}
      gap={gap}
    >
      <Box flexDirection="column" gap={gap}>
        <Box flexDirection="column" gap={gap}>
          <Text bold color={theme.success}>
            Models
          </Text>
          <Box paddingLeft={1}>{modelSummary}</Box>
        </Box>

        <Box flexDirection="column" gap={0}>
          <Text bold>Settings</Text>
          {settings.map((setting, index) => {
            const isSelected = index === selectedIndex
            return (
              <Box key={setting.id} flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Text
                    color={
                      isSelected
                        ? theme.kode
                        : setting.disabled
                          ? theme.secondaryText
                          : theme.text
                    }
                    wrap="truncate-end"
                  >
                    {isSelected ? figures.pointer : ' '} {setting.label}
                  </Text>
                  <Text
                    color={
                      setting.disabled ? theme.secondaryText : theme.suggestion
                    }
                    wrap="truncate-end"
                  >
                    {setting.type === 'boolean'
                      ? setting.value
                        ? 'enabled'
                        : 'disabled'
                      : setting.type === 'enum'
                        ? setting.value
                        : String(setting.value)}
                  </Text>
                </Box>

                {isSelected && editingString ? (
                  <Box flexDirection="column" paddingLeft={2}>
                    <Text color={theme.suggestion} wrap="truncate-end">
                      Enter new value: {currentInput}
                    </Text>
                    {inputError ? (
                      <Text color={theme.error} wrap="truncate-end">
                        {inputError}
                      </Text>
                    ) : null}
                  </Box>
                ) : null}
              </Box>
            )
          })}
        </Box>

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {editingString
              ? 'Enter to save · Esc to cancel'
              : '↑/↓ or j/k · Home/End · Enter toggle · Esc close · /model'}
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
