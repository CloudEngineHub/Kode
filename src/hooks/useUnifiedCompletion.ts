import { useState, useCallback, useEffect, useRef } from 'react'
import { useInput, type Key } from 'ink'
import { getCwd } from '@utils/state'
import { getActiveAgents } from '@utils/agentLoader'
import { getModelManager } from '@utils/model'
import { getCompletionContext } from '@utils/completion/context'
import { generateSuggestionsForContext } from '@utils/completion/generateSuggestions'
import {
  getEssentialCommands,
  getMinimalFallbackCommands,
} from '@utils/completion/commonUnixCommands'
import type {
  CompletionContext,
  UnifiedSuggestion,
} from '@utils/completion/types'
import type { Command } from '@commands'

export type { UnifiedSuggestion } from '@utils/completion/types'

interface Props {
  input: string
  cursorOffset: number
  onInputChange: (value: string) => void
  setCursorOffset: (offset: number) => void
  commands: Command[]
  disableSlashCommands?: boolean
  onSubmit?: (value: string, isSubmittingSlashCommand?: boolean) => void
}

/**
 * Unified completion system - Linus approved
 * One hook to rule them all, no bullshit, no complexity
 */
// Unified completion state - single source of truth
interface CompletionState {
  suggestions: UnifiedSuggestion[]
  selectedIndex: number
  isActive: boolean
  context: CompletionContext | null
  preview: {
    isActive: boolean
    originalInput: string
    wordRange: [number, number]
  } | null
  emptyDirMessage: string
  suppressUntil: number // timestamp for suppression
}

const INITIAL_STATE: CompletionState = {
  suggestions: [],
  selectedIndex: 0,
  isActive: false,
  context: null,
  preview: null,
  emptyDirMessage: '',
  suppressUntil: 0,
}

export function __getCompletionContextForTests(args: {
  input: string
  cursorOffset: number
  disableSlashCommands?: boolean
}): CompletionContext | null {
  return getCompletionContext(args)
}

export function useUnifiedCompletion({
  input,
  cursorOffset,
  onInputChange,
  setCursorOffset,
  commands,
  disableSlashCommands = false,
  onSubmit,
}: Props) {
  // Single state for entire completion system - Linus approved
  const [state, setState] = useState<CompletionState>(INITIAL_STATE)

  // State update helpers - clean and simple
  const updateState = useCallback((updates: Partial<CompletionState>) => {
    setState(prev => ({ ...prev, ...updates }))
  }, [])

  const resetCompletion = useCallback(() => {
    setState(prev => ({
      ...prev,
      suggestions: [],
      selectedIndex: 0,
      isActive: false,
      context: null,
      preview: null,
      emptyDirMessage: '',
    }))
  }, [])

  const activateCompletion = useCallback(
    (suggestions: UnifiedSuggestion[], context: CompletionContext) => {
      setState(prev => ({
        ...prev,
        suggestions: suggestions, // Keep the order from generateSuggestions (already sorted with weights)
        selectedIndex: 0,
        isActive: true,
        context,
        preview: null,
      }))
    },
    [],
  )

  // Direct state access - no legacy wrappers needed
  const { suggestions, selectedIndex, isActive, emptyDirMessage } = state

  // Clean word detection - Linus approved simplicity
  const getWordAtCursor = useCallback((): CompletionContext | null => {
    return __getCompletionContextForTests({
      input,
      cursorOffset,
      disableSlashCommands,
    })
  }, [input, cursorOffset, disableSlashCommands])

  // System commands cache - populated dynamically from $PATH
  const [systemCommands, setSystemCommands] = useState<string[]>([])
  const [isLoadingCommands, setIsLoadingCommands] = useState(false)

  // Load system commands from PATH (like real terminal)
  const loadSystemCommands = useCallback(async () => {
    if (systemCommands.length > 0 || isLoadingCommands) return // Already loaded or loading

    setIsLoadingCommands(true)
    try {
      const { readdirSync, statSync } = await import('fs')
      const pathDirs = (process.env.PATH || '').split(':').filter(Boolean)
      const commandSet = new Set<string>()

      // Get essential commands from utils
      const essentialCommands = getEssentialCommands()

      // Add essential commands first
      essentialCommands.forEach(cmd => commandSet.add(cmd))

      // Scan PATH directories for executables
      for (const dir of pathDirs) {
        try {
          if (readdirSync && statSync) {
            const entries = readdirSync(dir)
            for (const entry of entries) {
              try {
                const fullPath = `${dir}/${entry}`
                const stats = statSync(fullPath)
                // Check if it's executable (rough check)
                if (stats.isFile() && (stats.mode & 0o111) !== 0) {
                  commandSet.add(entry)
                }
              } catch {
                // Skip files we can't stat
              }
            }
          }
        } catch {
          // Skip directories we can't read
        }
      }

      const commands = Array.from(commandSet).sort()
      setSystemCommands(commands)
    } catch (error) {
      console.warn('Failed to load system commands, using fallback:', error)
      // Use minimal fallback commands from utils if system scan fails
      setSystemCommands(getMinimalFallbackCommands())
    } finally {
      setIsLoadingCommands(false)
    }
  }, [systemCommands.length, isLoadingCommands])

  // Load commands on first use
  useEffect(() => {
    loadSystemCommands()
  }, [loadSystemCommands])

  // Agent suggestions cache
  const [agentSuggestions, setAgentSuggestions] = useState<UnifiedSuggestion[]>(
    [],
  )

  // Model suggestions cache
  const [modelSuggestions, setModelSuggestions] = useState<UnifiedSuggestion[]>(
    [],
  )

  // Load model suggestions
  useEffect(() => {
    try {
      const modelManager = getModelManager()
      const allModels = modelManager.getAllAvailableModelNames()

      const suggestions = allModels.map(modelId => {
        // Professional and clear description for expert model consultation
        return {
          value: `ask-${modelId}`,
          displayValue: `🦜 ask-${modelId} :: Consult ${modelId} for expert opinion and specialized analysis`,
          type: 'ask' as const,
          score: 90, // Higher than agents - put ask-models on top
          metadata: { modelId },
        }
      })

      setModelSuggestions(suggestions)
    } catch (error) {
      console.warn('[useUnifiedCompletion] Failed to load models:', error)
      // No fallback - rely on dynamic loading only
      setModelSuggestions([])
    }
  }, [])

  // Load agent suggestions on mount
  useEffect(() => {
    getActiveAgents()
      .then(agents => {
        // agents is an array of AgentConfig, not an object
        const suggestions = agents.map(config => {
          // 🧠 智能描述算法 - 适应性长度控制
          let shortDesc = config.whenToUse

          // 移除常见的冗余前缀，但保留核心内容
          const prefixPatterns = [
            /^Use this agent when you need (assistance with: )?/i,
            /^Use PROACTIVELY (when|to) /i,
            /^Specialized in /i,
            /^Implementation specialist for /i,
            /^Design validation specialist\.? Use PROACTIVELY to /i,
            /^Task validation specialist\.? Use PROACTIVELY to /i,
            /^Requirements validation specialist\.? Use PROACTIVELY to /i,
          ]

          for (const pattern of prefixPatterns) {
            shortDesc = shortDesc.replace(pattern, '')
          }

          // 🎯 精准断句算法：中英文句号感叹号优先 → 逗号 → 省略
          const findSmartBreak = (text: string, maxLength: number) => {
            if (text.length <= maxLength) return text

            // 第一优先级：中英文句号、感叹号
            const sentenceEndings = /[.!。！]/
            const firstSentenceMatch = text.search(sentenceEndings)
            if (firstSentenceMatch !== -1) {
              const firstSentence = text.slice(0, firstSentenceMatch).trim()
              if (firstSentence.length >= 5) {
                return firstSentence
              }
            }

            // 如果第一句过长，找逗号断句
            if (text.length > maxLength) {
              const commaEndings = /[,，]/
              const commas = []
              let match
              const regex = new RegExp(commaEndings, 'g')
              while ((match = regex.exec(text)) !== null) {
                commas.push(match.index)
              }

              // 找最后一个在maxLength内的逗号
              for (let i = commas.length - 1; i >= 0; i--) {
                const commaPos = commas[i]
                if (commaPos < maxLength) {
                  const clause = text.slice(0, commaPos).trim()
                  if (clause.length >= 5) {
                    return clause
                  }
                }
              }
            }

            // 最后选择：直接省略
            return text.slice(0, maxLength) + '...'
          }

          shortDesc = findSmartBreak(shortDesc.trim(), 80) // 增加到80字符限制

          // 如果处理后为空或太短，使用原始描述
          if (!shortDesc || shortDesc.length < 5) {
            shortDesc = findSmartBreak(config.whenToUse, 80)
          }

          return {
            value: `run-agent-${config.agentType}`,
            displayValue: `👤 run-agent-${config.agentType} :: ${shortDesc}`, // 人类图标 + run-agent前缀 + 简洁描述
            type: 'agent' as const,
            score: 85, // Lower than ask-models
            metadata: config,
          }
        })
        // Agents loaded successfully
        setAgentSuggestions(suggestions)
      })
      .catch(error => {
        console.warn('[useUnifiedCompletion] Failed to load agents:', error)
        // No fallback - rely on dynamic loading only
        setAgentSuggestions([])
      })
  }, [])

  const generateSuggestions = useCallback(
    (context: CompletionContext): UnifiedSuggestion[] =>
      generateSuggestionsForContext({
        context,
        commands,
        agentSuggestions,
        modelSuggestions,
        systemCommands,
        isLoadingCommands,
        cwd: getCwd(),
      }),
    [
      commands,
      agentSuggestions,
      modelSuggestions,
      systemCommands,
      isLoadingCommands,
    ],
  )

  // Complete with a suggestion - 支持万能@引用 + slash命令自动执行
  const completeWith = useCallback(
    (suggestion: UnifiedSuggestion, context: CompletionContext) => {
      let completion: string

      if (context.type === 'command') {
        completion = `/${suggestion.value} `
      } else if (context.type === 'agent') {
        // 🚀 万能@引用：根据建议类型决定补全格式
        if (suggestion.type === 'agent') {
          completion = `@${suggestion.value} ` // 代理补全
        } else if (suggestion.type === 'ask') {
          completion = `@${suggestion.value} ` // Ask模型补全
        } else {
          // File reference in @mention context - no space for directories to allow expansion
          const isDirectory = suggestion.value.endsWith('/')
          completion = `@${suggestion.value}${isDirectory ? '' : ' '}` // 文件夹不加空格，文件加空格
        }
      } else {
        // Regular file completion OR smart mention matching
        if (suggestion.isSmartMatch) {
          // Smart mention - add @ prefix and space
          completion = `@${suggestion.value} `
        } else {
          // Regular file completion - no space for directories to allow expansion
          const isDirectory = suggestion.value.endsWith('/')
          completion = suggestion.value + (isDirectory ? '' : ' ')
        }
      }

      // Special handling for absolute paths in file completion
      // When completing an absolute path, we should replace the entire current word/path
      let actualEndPos: number

      if (
        context.type === 'file' &&
        suggestion.value.startsWith('/') &&
        !suggestion.isSmartMatch
      ) {
        // For absolute paths, find the end of the current path/word
        let end = context.startPos
        while (
          end < input.length &&
          input[end] !== ' ' &&
          input[end] !== '\n'
        ) {
          end++
        }
        actualEndPos = end
      } else {
        // Original logic for other cases
        const currentWord = input.slice(context.startPos)
        const nextSpaceIndex = currentWord.indexOf(' ')
        actualEndPos =
          nextSpaceIndex === -1
            ? input.length
            : context.startPos + nextSpaceIndex
      }

      const newInput =
        input.slice(0, context.startPos) +
        completion +
        input.slice(actualEndPos)
      onInputChange(newInput)
      setCursorOffset(context.startPos + completion.length)

      // Don't auto-execute slash commands - let user press Enter to submit
      // This gives users a chance to add arguments or modify the command

      // Completion applied
    },
    [input, onInputChange, setCursorOffset, onSubmit, commands],
  )

  // Partial complete to common prefix
  const partialComplete = useCallback(
    (prefix: string, context: CompletionContext) => {
      const completion =
        context.type === 'command'
          ? `/${prefix}`
          : context.type === 'agent'
            ? `@${prefix}`
            : prefix

      const newInput =
        input.slice(0, context.startPos) +
        completion +
        input.slice(context.endPos)
      onInputChange(newInput)
      setCursorOffset(context.startPos + completion.length)
    },
    [input, onInputChange, setCursorOffset],
  )

  // Handle Tab key - simplified and unified
  useInput((input_str, key) => {
    if (!__shouldHandleUnifiedCompletionTabKeyForTests(key)) return false

    const context = getWordAtCursor()
    if (!context) return false

    // If menu is already showing, cycle through suggestions
    if (state.isActive && state.suggestions.length > 0) {
      const nextIndex = (state.selectedIndex + 1) % state.suggestions.length
      const nextSuggestion = state.suggestions[nextIndex]

      if (state.context) {
        // Calculate proper word boundaries
        const currentWord = input.slice(state.context.startPos)
        const wordEnd = currentWord.search(/\s/)
        const actualEndPos =
          wordEnd === -1 ? input.length : state.context.startPos + wordEnd

        // Apply appropriate prefix based on context type and suggestion type
        let preview: string
        if (state.context.type === 'command') {
          preview = `/${nextSuggestion.value}`
        } else if (state.context.type === 'agent') {
          // For @mentions, always add @ prefix
          preview = `@${nextSuggestion.value}`
        } else if (nextSuggestion.isSmartMatch) {
          // Smart match from normal input - add @ prefix
          preview = `@${nextSuggestion.value}`
        } else {
          preview = nextSuggestion.value
        }

        // Apply preview
        const newInput =
          input.slice(0, state.context.startPos) +
          preview +
          input.slice(actualEndPos)

        onInputChange(newInput)
        setCursorOffset(state.context.startPos + preview.length)

        // Update state
        updateState({
          selectedIndex: nextIndex,
          preview: {
            isActive: true,
            originalInput: input,
            wordRange: [
              state.context.startPos,
              state.context.startPos + preview.length,
            ],
          },
        })
      }
      return true
    }

    // Generate new suggestions
    const currentSuggestions = generateSuggestions(context)

    if (currentSuggestions.length === 0) {
      return false // Let Tab pass through
    } else if (currentSuggestions.length === 1) {
      // Single match: complete immediately
      completeWith(currentSuggestions[0], context)
      return true
    } else {
      // Show menu and apply first suggestion
      activateCompletion(currentSuggestions, context)

      // Immediately apply first suggestion as preview
      const firstSuggestion = currentSuggestions[0]
      const currentWord = input.slice(context.startPos)
      const wordEnd = currentWord.search(/\s/)
      const actualEndPos =
        wordEnd === -1 ? input.length : context.startPos + wordEnd

      let preview: string
      if (context.type === 'command') {
        preview = `/${firstSuggestion.value}`
      } else if (context.type === 'agent') {
        preview = `@${firstSuggestion.value}`
      } else if (firstSuggestion.isSmartMatch) {
        // Smart match from normal input - add @ prefix
        preview = `@${firstSuggestion.value}`
      } else {
        preview = firstSuggestion.value
      }

      const newInput =
        input.slice(0, context.startPos) + preview + input.slice(actualEndPos)

      onInputChange(newInput)
      setCursorOffset(context.startPos + preview.length)

      updateState({
        preview: {
          isActive: true,
          originalInput: input,
          wordRange: [context.startPos, context.startPos + preview.length],
        },
      })

      return true
    }
  })

  // Handle navigation keys - simplified and unified
  useInput((inputChar, key) => {
    // Enter key - confirm selection and end completion (always add space)
    if (
      key.return &&
      !key.shift &&
      !key.meta &&
      state.isActive &&
      state.suggestions.length > 0
    ) {
      const selectedSuggestion = state.suggestions[state.selectedIndex]
      if (selectedSuggestion && state.context) {
        // For Enter key, always add space even for directories to indicate completion end
        let completion: string

        if (state.context.type === 'command') {
          completion = `/${selectedSuggestion.value} `
        } else if (state.context.type === 'agent') {
          if (selectedSuggestion.type === 'agent') {
            completion = `@${selectedSuggestion.value} `
          } else if (selectedSuggestion.type === 'ask') {
            completion = `@${selectedSuggestion.value} `
          } else {
            // File reference in @mention context - always add space on Enter
            completion = `@${selectedSuggestion.value} `
          }
        } else if (selectedSuggestion.isSmartMatch) {
          // Smart match from normal input - add @ prefix
          completion = `@${selectedSuggestion.value} `
        } else {
          // Regular file completion - always add space on Enter
          completion = selectedSuggestion.value + ' '
        }

        // Apply completion with forced space
        const currentWord = input.slice(state.context.startPos)
        const nextSpaceIndex = currentWord.indexOf(' ')
        const actualEndPos =
          nextSpaceIndex === -1
            ? input.length
            : state.context.startPos + nextSpaceIndex

        const newInput =
          input.slice(0, state.context.startPos) +
          completion +
          input.slice(actualEndPos)
        onInputChange(newInput)
        setCursorOffset(state.context.startPos + completion.length)
      }
      resetCompletion()
      return true
    }

    if (!state.isActive || state.suggestions.length === 0) return false

    // Arrow key navigation with preview
    const handleNavigation = (newIndex: number) => {
      const preview = state.suggestions[newIndex].value

      if (state.preview?.isActive && state.context) {
        const newInput =
          input.slice(0, state.context.startPos) +
          preview +
          input.slice(state.preview.wordRange[1])

        onInputChange(newInput)
        setCursorOffset(state.context.startPos + preview.length)

        updateState({
          selectedIndex: newIndex,
          preview: {
            ...state.preview,
            wordRange: [
              state.context.startPos,
              state.context.startPos + preview.length,
            ],
          },
        })
      } else {
        updateState({ selectedIndex: newIndex })
      }
    }

    if (key.downArrow) {
      const nextIndex = (state.selectedIndex + 1) % state.suggestions.length
      handleNavigation(nextIndex)
      return true
    }

    if (key.upArrow) {
      const nextIndex =
        state.selectedIndex === 0
          ? state.suggestions.length - 1
          : state.selectedIndex - 1
      handleNavigation(nextIndex)
      return true
    }

    // Space should behave like normal typing: do not accept completions.
    // This avoids surprising "auto-complete on space" behavior and keeps
    // the user's input intent intact.
    if (inputChar === ' ') {
      resetCompletion()
      return false
    }

    // Right arrow key - same as space but different semantics
    if (key.rightArrow) {
      const selectedSuggestion = state.suggestions[state.selectedIndex]
      const isDirectory = selectedSuggestion.value.endsWith('/')

      if (!state.context) return false

      // Apply completion
      const currentWordAtContext = input.slice(
        state.context.startPos,
        state.context.startPos + selectedSuggestion.value.length,
      )

      if (currentWordAtContext !== selectedSuggestion.value) {
        completeWith(selectedSuggestion, state.context)
      }

      resetCompletion()

      if (isDirectory) {
        // Continue for directories
        setTimeout(() => {
          const newContext = {
            ...state.context,
            prefix: selectedSuggestion.value,
            endPos: state.context.startPos + selectedSuggestion.value.length,
          }

          const newSuggestions = generateSuggestions(newContext)

          if (newSuggestions.length > 0) {
            activateCompletion(newSuggestions, newContext)
          } else {
            updateState({
              emptyDirMessage: `Directory is empty: ${selectedSuggestion.value}`,
            })
            setTimeout(() => updateState({ emptyDirMessage: '' }), 3000)
          }
        }, 50)
      }

      return true
    }

    if (key.escape) {
      // Restore original text if in preview mode
      if (state.preview?.isActive && state.context) {
        onInputChange(state.preview.originalInput)
        setCursorOffset(state.context.startPos + state.context.prefix.length)
      }

      resetCompletion()
      return true
    }

    return false
  })

  // Handle delete/backspace keys - unified state management
  useInput((input_str, key) => {
    if (key.backspace || key.delete) {
      if (state.isActive) {
        resetCompletion()
        // Smart suppression based on input complexity
        const suppressionTime = input.length > 10 ? 200 : 100
        updateState({
          suppressUntil: Date.now() + suppressionTime,
        })
        return true
      }
    }
    return false
  })

  // Input tracking with ref to avoid infinite loops
  const lastInputRef = useRef('')

  // Smart auto-triggering with cycle prevention
  useEffect(() => {
    // Prevent infinite loops by using ref
    if (lastInputRef.current === input) return

    const inputLengthChange = Math.abs(
      input.length - lastInputRef.current.length,
    )
    const isHistoryNavigation =
      (inputLengthChange > 10 || // Large content change
        (inputLengthChange > 5 &&
          !input.includes(lastInputRef.current.slice(-5)))) && // Different content
      input !== lastInputRef.current

    // Update ref (no state update)
    lastInputRef.current = input

    // Skip if in preview mode or suppressed
    if (state.preview?.isActive || Date.now() < state.suppressUntil) {
      return
    }

    // Clear suggestions on history navigation
    if (isHistoryNavigation && state.isActive) {
      resetCompletion()
      return
    }

    const context = getWordAtCursor()

    if (context && shouldAutoTrigger(context)) {
      const newSuggestions = generateSuggestions(context)

      if (newSuggestions.length === 0) {
        resetCompletion()
      } else if (
        newSuggestions.length === 1 &&
        shouldAutoHideSingleMatch(newSuggestions[0], context)
      ) {
        resetCompletion() // Perfect match - hide
      } else {
        activateCompletion(newSuggestions, context)
      }
    } else if (state.context) {
      // Check if context changed significantly
      const contextChanged =
        !context ||
        state.context.type !== context.type ||
        state.context.startPos !== context.startPos ||
        !context.prefix.startsWith(state.context.prefix)

      if (contextChanged) {
        resetCompletion()
      }
    }
  }, [input, cursorOffset])

  // Smart triggering - only when it makes sense
  const shouldAutoTrigger = useCallback(
    (context: CompletionContext): boolean => {
      switch (context.type) {
        case 'command':
          // Trigger immediately for slash commands
          return true
        case 'agent':
          // Trigger immediately for agent references
          return true
        case 'file':
          // Be selective about file completion - avoid noise
          const prefix = context.prefix

          // Always trigger for clear path patterns
          if (
            prefix.startsWith('./') ||
            prefix.startsWith('../') ||
            prefix.startsWith('/') ||
            prefix.startsWith('~') ||
            prefix.includes('/')
          ) {
            return true
          }

          // Trigger for single dot followed by something (like .g for .gitignore)
          if (prefix.startsWith('.') && prefix.length >= 2) {
            return true
          }

          // Skip very short prefixes that are likely code
          return false
        default:
          return false
      }
    },
    [],
  )

  // Helper function to determine if single suggestion should be auto-hidden
  const shouldAutoHideSingleMatch = useCallback(
    (suggestion: UnifiedSuggestion, context: CompletionContext): boolean => {
      // Extract the actual typed input from context
      const currentInput = input.slice(context.startPos, context.endPos)
      // Check if should auto-hide single match

      // For files: more intelligent matching
      if (context.type === 'file') {
        // Special case: if suggestion is a directory (ends with /), don't auto-hide
        // because user might want to continue navigating into it
        if (suggestion.value.endsWith('/')) {
          // Directory suggestion, keeping visible
          return false
        }

        // Check exact match
        if (currentInput === suggestion.value) {
          // Exact match, hiding
          return true
        }

        // Check if current input is a complete file path and suggestion is just the filename
        // e.g., currentInput: "src/tools/ThinkTool/ThinkTool.tsx", suggestion: "ThinkTool.tsx"
        if (
          currentInput.endsWith('/' + suggestion.value) ||
          currentInput.endsWith(suggestion.value)
        ) {
          // Path ends with suggestion, hiding
          return true
        }

        return false
      }

      // For commands: check if /prefix exactly matches /command
      if (context.type === 'command') {
        const fullCommand = `/${suggestion.value}`
        const matches = currentInput === fullCommand
        // Check command match
        return matches
      }

      // For agents: check if @prefix exactly matches @agent-name
      if (context.type === 'agent') {
        const fullAgent = `@${suggestion.value}`
        const matches = currentInput === fullAgent
        // Check agent match
        return matches
      }

      return false
    },
    [input],
  )

  return {
    suggestions,
    selectedIndex,
    isActive,
    emptyDirMessage,
  }
}

export function __shouldHandleUnifiedCompletionTabKeyForTests(
  key: Key,
): boolean {
  return Boolean(key.tab) && !Boolean(key.shift)
}
