import { useState, useCallback, useEffect, useRef } from 'react'
import { useInput } from 'ink'
import { existsSync, statSync, readdirSync } from 'fs'
import { join, dirname, basename, resolve } from 'path'
import { getCwd } from '../utils/state'
import { getCommand } from '../commands'
import { getActiveAgents } from '../utils/agentLoader'
import { glob } from 'glob'
import type { Command } from '../commands'

// Unified suggestion type for all completion types
export interface UnifiedSuggestion {
  value: string
  displayValue: string
  type: 'command' | 'agent' | 'file'
  icon?: string
  score: number
  metadata?: any
}

interface CompletionContext {
  type: 'command' | 'agent' | 'file' | null
  prefix: string
  startPos: number
  endPos: number
}

// Terminal behavior state for preview and cycling
interface TerminalState {
  originalWord: string
  wordContext: { start: number; end: number } | null
  isPreviewMode: boolean
}

interface Props {
  input: string
  cursorOffset: number
  onInputChange: (value: string) => void
  setCursorOffset: (offset: number) => void
  commands: Command[]
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
  suppressUntil: 0
}

export function useUnifiedCompletion({
  input,
  cursorOffset,
  onInputChange,
  setCursorOffset,
  commands,
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
      emptyDirMessage: ''
    }))
  }, [])

  const activateCompletion = useCallback((suggestions: UnifiedSuggestion[], context: CompletionContext) => {
    setState(prev => ({
      ...prev,
      suggestions: suggestions.sort((a, b) => b.score - a.score),
      selectedIndex: 0,
      isActive: true,
      context,
      preview: null
    }))
  }, [])

  // Direct state access - no legacy wrappers needed
  const { suggestions, selectedIndex, isActive, emptyDirMessage } = state

  // Find common prefix among suggestions (terminal behavior)
  const findCommonPrefix = useCallback((suggestions: UnifiedSuggestion[]): string => {
    if (suggestions.length === 0) return ''
    if (suggestions.length === 1) return suggestions[0].value
    
    let prefix = suggestions[0].value
    
    for (let i = 1; i < suggestions.length; i++) {
      const str = suggestions[i].value
      let j = 0
      while (j < prefix.length && j < str.length && prefix[j] === str[j]) {
        j++
      }
      prefix = prefix.slice(0, j)
      
      if (prefix.length === 0) return ''
    }
    
    return prefix
  }, [])

  // Clean word detection - Linus approved simplicity
  const getWordAtCursor = useCallback((): CompletionContext | null => {
    if (!input) return null
    
    // Find word boundaries - simple and clean
    let start = cursorOffset
    let end = cursorOffset
    
    while (start > 0 && !/\s/.test(input[start - 1])) start--
    while (end < input.length && !/\s/.test(input[end])) end++
    
    const word = input.slice(start, end)
    if (!word) return null
    
    // Priority-based type detection - no special cases needed
    if (word.startsWith('/')) {
      const beforeWord = input.slice(0, start).trim()
      const isCommand = beforeWord === '' && !word.includes('/', 1)
      return {
        type: isCommand ? 'command' : 'file',
        prefix: isCommand ? word.slice(1) : word,
        startPos: start,
        endPos: end
      }
    }
    
    if (word.startsWith('@')) {
      return {
        type: 'agent',
        prefix: word.slice(1),
        startPos: start,
        endPos: end
      }
    }
    
    // Everything else defaults to file completion
    return {
      type: 'file', 
      prefix: word,
      startPos: start,
      endPos: end
    }
  }, [input, cursorOffset])

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
      
      // Common fallback commands in case PATH is empty
      const fallbackCommands = [
        'ls', 'cd', 'pwd', 'cat', 'grep', 'find', 'which', 'man', 'cp', 'mv', 'rm', 'mkdir',
        'touch', 'chmod', 'ps', 'top', 'kill', 'git', 'node', 'npm', 'python', 'python3',
        'curl', 'wget', 'docker', 'vim', 'nano', 'echo', 'export', 'env', 'sudo'
      ]
      
      // Add fallback commands first
      fallbackCommands.forEach(cmd => commandSet.add(cmd))
      
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
      // Fallback to basic commands if system scan fails
      setSystemCommands([
        'ls', 'cd', 'pwd', 'cat', 'grep', 'find', 'git', 'node', 'npm', 'python', 'vim', 'nano'
      ])
    } finally {
      setIsLoadingCommands(false)
    }
  }, [systemCommands.length, isLoadingCommands])
  
  // Load commands on first use
  useEffect(() => {
    loadSystemCommands()
  }, [loadSystemCommands])

  // Generate command suggestions (slash commands)
  const generateCommandSuggestions = useCallback((prefix: string): UnifiedSuggestion[] => {
    const filteredCommands = commands.filter(cmd => !cmd.isHidden)
    
    if (!prefix) {
      // Show all commands when prefix is empty (for single /)
      return filteredCommands.map(cmd => ({
        value: cmd.userFacingName(),
        displayValue: `/${cmd.userFacingName()}`,
        type: 'command' as const,
        score: 100,
      }))
    }
    
    return filteredCommands
      .filter(cmd => {
        const names = [cmd.userFacingName(), ...(cmd.aliases || [])]
        return names.some(name => name.toLowerCase().startsWith(prefix.toLowerCase()))
      })
      .map(cmd => ({
        value: cmd.userFacingName(),
        displayValue: `/${cmd.userFacingName()}`,
        type: 'command' as const,
        score: 100 - prefix.length + (cmd.userFacingName().startsWith(prefix) ? 10 : 0),
      }))
  }, [commands])

  // Generate Unix command suggestions from system PATH
  const generateUnixCommandSuggestions = useCallback((prefix: string): UnifiedSuggestion[] => {
    if (!prefix) return []
    
    // If still loading commands, show loading indicator
    if (isLoadingCommands) {
      return [{
        value: 'loading...',
        displayValue: `⏳ Loading system commands...`,
        type: 'file' as const,
        score: 0,
        metadata: { isLoading: true }
      }]
    }
    
    const matchingCommands = systemCommands
      .filter(cmd => cmd.toLowerCase().startsWith(prefix.toLowerCase()))
      .slice(0, 20) // Limit to top 20 matches for performance
      .map(cmd => ({
        value: cmd,
        displayValue: `◆ ${cmd}`, // 钻石符号表示系统命令
        type: 'command' as const, // Correct type for system commands
        score: 85 + (cmd === prefix ? 10 : 0), // Boost exact matches
        metadata: { isUnixCommand: true }
      }))
    
    return matchingCommands
  }, [systemCommands, isLoadingCommands])

  // Agent suggestions cache
  const [agentSuggestions, setAgentSuggestions] = useState<UnifiedSuggestion[]>([])
  
  // Load agent suggestions on mount
  useEffect(() => {
    getActiveAgents().then(agents => {
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
          /^Requirements validation specialist\.? Use PROACTIVELY to /i
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
          value: config.agentType,
          displayValue: `👤 agent-${config.agentType} :: ${shortDesc}`, // 人类图标 + agent前缀 + HACK双冒号
          type: 'agent' as const,
          score: 90,
          metadata: config,
        }
      })
      // Agents loaded successfully
      setAgentSuggestions(suggestions)
    }).catch((error) => {
      console.warn('[useUnifiedCompletion] Failed to load agents:', error)
      // Fallback to basic suggestions if agent loading fails
      setAgentSuggestions([
        {
          value: 'general-purpose',
          displayValue: '👤 agent-general-purpose :: General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks', // 人类图标 + HACK风格
          type: 'agent' as const,
          score: 90,
          metadata: { whenToUse: 'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks' }
        }
      ])
    })
  }, [])

  // Generate agent suggestions (sync)
  const generateAgentSuggestions = useCallback((prefix: string): UnifiedSuggestion[] => {
    // Process agent suggestions
    
    if (!prefix) {
      // Show all agents when prefix is empty (for single @)
      // Return all agents when no prefix
      return agentSuggestions
    }
    
    const filtered = agentSuggestions
      .filter(suggestion => 
        suggestion.value.toLowerCase().includes(prefix.toLowerCase())
      )
      .map(suggestion => ({
        ...suggestion,
        score: 90 - prefix.length + (suggestion.value.startsWith(prefix) ? 10 : 0)
      }))
    
    // Return filtered agents
    return filtered
  }, [agentSuggestions])

  // Generate file AND unix command suggestions - 支持@引用路径
  const generateFileSuggestions = useCallback((prefix: string): UnifiedSuggestion[] => {
    // First try Unix commands (不包含在@引用中)
    const unixSuggestions = generateUnixCommandSuggestions(prefix)
    
    // Then try file system
    try {
      const cwd = getCwd()
      let searchPath = prefix || '.'
      
      // 🚀 处理@引用的路径：如果prefix以@开头的路径，去掉@进行文件系统查找
      let actualSearchPath = searchPath
      if (searchPath.startsWith('@')) {
        actualSearchPath = searchPath.slice(1) // 去掉@符号进行实际文件查找
      }
      
      // Expand ~ immediately
      if (actualSearchPath.startsWith('~')) {
        actualSearchPath = actualSearchPath.replace('~', process.env.HOME || '')
      }
      
      const absolutePath = resolve(cwd, actualSearchPath)
      const dir = existsSync(absolutePath) && statSync(absolutePath).isDirectory() 
        ? absolutePath 
        : dirname(absolutePath)
      const filePrefix = existsSync(absolutePath) && statSync(absolutePath).isDirectory()
        ? ''
        : basename(absolutePath)
      
      if (!existsSync(dir)) return []
      
      const entries = readdirSync(dir)
        .filter(entry => !filePrefix || entry.toLowerCase().startsWith(filePrefix.toLowerCase()))
        .slice(0, 10) // Limit for performance
      
      const fileSuggestions = entries.map(entry => {
        const fullPath = join(dir, entry)
        const isDir = statSync(fullPath).isDirectory()
        const icon = isDir ? '📁' : '📄'
        
        // Simplified path generation logic - no special cases
        let value: string
        const isAtReference = prefix.startsWith('@')
        const pathPrefix = isAtReference ? prefix.slice(1) : prefix
        
        if (pathPrefix.includes('/')) {
          // Has path separator - build from directory structure
          if (pathPrefix.endsWith('/') || (existsSync(absolutePath) && statSync(absolutePath).isDirectory() && basename(absolutePath) === basename(pathPrefix))) {
            // Directory listing case
            value = prefix + (prefix.endsWith('/') ? '' : '/') + entry + (isDir ? '/' : '')
          } else {
            // Partial filename completion
            value = join(dirname(prefix), entry) + (isDir ? '/' : '')
          }
        } else {
          // Simple case - no path separator
          const actualPrefix = isAtReference ? pathPrefix : prefix
          if (existsSync(resolve(dir, actualPrefix)) && statSync(resolve(dir, actualPrefix)).isDirectory()) {
            // Existing directory - list contents
            value = prefix + '/' + entry + (isDir ? '/' : '')
          } else {
            // File/directory at current level
            value = (isAtReference ? '@' : '') + entry + (isDir ? '/' : '')
          }
        }
        
        return {
          value,
          displayValue: `${icon} ${entry}${isDir ? '/' : ''}`, // 恢复实用图标
          type: 'file' as const,
          score: isDir ? 80 : 70, // Directories score higher
        }
      })
      
      // Combine Unix commands and file suggestions
      return [...unixSuggestions, ...fileSuggestions]
    } catch {
      return unixSuggestions // At least return Unix commands if file system fails
    }
  }, [generateUnixCommandSuggestions])

  // Generate all suggestions based on context
  const generateSuggestions = useCallback((context: CompletionContext): UnifiedSuggestion[] => {
    switch (context.type) {
      case 'command':
        return generateCommandSuggestions(context.prefix)
      case 'agent': {
        // 🚀 @ = 万能引用符！更优雅的分组显示
        const agentSuggestions = generateAgentSuggestions(context.prefix)
        const fileSuggestions = generateFileSuggestions(context.prefix)
          .filter(suggestion => !suggestion.metadata?.isUnixCommand) // 排除unix命令，只保留文件
          .map(suggestion => ({
            ...suggestion,
            // 文件建议保持原始displayValue，避免重复图标
            type: 'file' as const,
            score: suggestion.score - 10, // 代理优先级更高
          }))
        
        // 🎨 优雅分组策略
        let finalSuggestions: UnifiedSuggestion[] = []
        
        if (!context.prefix) {
          // 单独@符号：显示所有agents和files，简洁无标题
          const topAgents = agentSuggestions // 显示所有代理
          const topFiles = fileSuggestions   // 显示所有文件
          
          // 🎨 终极简洁：直接混合显示，代理优先
          finalSuggestions = [...topAgents, ...topFiles]
            .sort((a, b) => {
              // 代理类型优先显示
              if (a.type === 'agent' && b.type === 'file') return -1
              if (a.type === 'file' && b.type === 'agent') return 1
              return b.score - a.score
            })
        } else {
          // 有前缀：按相关性混合显示，但代理优先，不限制数量
          const relevantAgents = agentSuggestions // 显示所有匹配的代理
          const relevantFiles = fileSuggestions   // 显示所有匹配的文件
          
          finalSuggestions = [...relevantAgents, ...relevantFiles]
            .sort((a, b) => {
              // 代理类型优先
              if (a.type === 'agent' && b.type === 'file') return -1
              if (a.type === 'file' && b.type === 'agent') return 1
              return b.score - a.score
            })
        }
        
        // Generated mixed suggestions for @ reference
        
        return finalSuggestions
      }
      case 'file':
        return generateFileSuggestions(context.prefix)
      default:
        return []
    }
  }, [generateCommandSuggestions, generateAgentSuggestions, generateFileSuggestions])


  // Complete with a suggestion - 支持万能@引用 + slash命令自动执行
  const completeWith = useCallback((suggestion: UnifiedSuggestion, context: CompletionContext) => {
    let completion: string
    
    if (context.type === 'command') {
      completion = `/${suggestion.value} `
    } else if (context.type === 'agent') {
      // 🚀 万能@引用：根据建议类型决定补全格式
      if (suggestion.type === 'agent') {
        completion = `@${suggestion.value} ` // 代理补全
      } else {
        completion = `@${suggestion.value} ` // 文件引用也用@
      }
    } else {
      completion = suggestion.value // 普通文件补全
    }
    
    // Special handling for absolute paths in file completion
    // When completing an absolute path, we should replace the entire current word/path
    let actualEndPos: number
    
    if (context.type === 'file' && suggestion.value.startsWith('/')) {
      // For absolute paths, find the end of the current path/word
      let end = context.startPos
      while (end < input.length && input[end] !== ' ' && input[end] !== '\n') {
        end++
      }
      actualEndPos = end
    } else {
      // Original logic for other cases
      const currentWord = input.slice(context.startPos)
      const nextSpaceIndex = currentWord.indexOf(' ')
      actualEndPos = nextSpaceIndex === -1 ? input.length : context.startPos + nextSpaceIndex
    }
    
    const newInput = input.slice(0, context.startPos) + completion + input.slice(actualEndPos)
    onInputChange(newInput)
    setCursorOffset(context.startPos + completion.length)
    
    // Don't auto-execute slash commands - let user press Enter to submit
    // This gives users a chance to add arguments or modify the command
    
    // Completion applied
  }, [input, onInputChange, setCursorOffset, onSubmit, commands])

  // Partial complete to common prefix
  const partialComplete = useCallback((prefix: string, context: CompletionContext) => {
    const completion = context.type === 'command' ? `/${prefix}` :
                      context.type === 'agent' ? `@${prefix}` :
                      prefix
    
    const newInput = input.slice(0, context.startPos) + completion + input.slice(context.endPos)
    onInputChange(newInput)
    setCursorOffset(context.startPos + completion.length)
  }, [input, onInputChange, setCursorOffset])


  // Handle Tab key - simplified and unified
  useInput((input_str, key) => {
    if (!key.tab || key.shift) return false
    
    const context = getWordAtCursor()
    if (!context) return false
    
    // If menu is already showing, cycle through suggestions
    if (state.isActive && state.suggestions.length > 0) {
      const nextIndex = (state.selectedIndex + 1) % state.suggestions.length
      const preview = state.suggestions[nextIndex].value
      
      if (state.context) {
        // Calculate proper word boundaries
        const currentWord = input.slice(state.context.startPos)
        const wordEnd = currentWord.search(/\s/)
        const actualEndPos = wordEnd === -1 
          ? input.length 
          : state.context.startPos + wordEnd
        
        // Apply preview
        const newInput = input.slice(0, state.context.startPos) + 
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
            wordRange: [state.context.startPos, state.context.startPos + preview.length]
          }
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
      // Check for common prefix
      const commonPrefix = findCommonPrefix(currentSuggestions)
      
      if (commonPrefix.length > context.prefix.length) {
        partialComplete(commonPrefix, context)
        return true
      } else {
        // Show menu
        activateCompletion(currentSuggestions, context)
        return true
      }
    }
  })

  // Handle navigation keys - simplified and unified  
  useInput((_, key) => {
    // Enter key - confirm selection
    if (key.return && state.isActive && state.suggestions.length > 0) {
      const selectedSuggestion = state.suggestions[state.selectedIndex]
      if (selectedSuggestion && state.context) {
        completeWith(selectedSuggestion, state.context)
      }
      resetCompletion()
      return true
    }
    
    if (!state.isActive || state.suggestions.length === 0) return false
    
    // Arrow key navigation with preview
    const handleNavigation = (newIndex: number) => {
      const preview = state.suggestions[newIndex].value
      
      if (state.preview?.isActive && state.context) {
        const newInput = input.slice(0, state.context.startPos) + 
                         preview + 
                         input.slice(state.preview.wordRange[1])
        
        onInputChange(newInput)
        setCursorOffset(state.context.startPos + preview.length)
        
        updateState({
          selectedIndex: newIndex,
          preview: {
            ...state.preview,
            wordRange: [state.context.startPos, state.context.startPos + preview.length]
          }
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
      const nextIndex = state.selectedIndex === 0 
        ? state.suggestions.length - 1 
        : state.selectedIndex - 1
      handleNavigation(nextIndex)
      return true
    }
    
    // Space key - complete and potentially continue for directories
    if (key.space && state.isActive && state.suggestions.length > 0) {
      const selectedSuggestion = state.suggestions[state.selectedIndex]
      const isDirectory = selectedSuggestion.value.endsWith('/')
      
      if (!state.context) return false
      
      // Apply completion if needed
      const currentWordAtContext = input.slice(state.context.startPos, 
        state.context.startPos + selectedSuggestion.value.length)
      
      if (currentWordAtContext !== selectedSuggestion.value) {
        completeWith(selectedSuggestion, state.context)
      }
      
      resetCompletion()
      
      if (isDirectory) {
        // Continue completion for directories
        setTimeout(() => {
          const newContext = {
            ...state.context,
            prefix: selectedSuggestion.value,
            endPos: state.context.startPos + selectedSuggestion.value.length
          }
          
          const newSuggestions = generateSuggestions(newContext)
          
          if (newSuggestions.length > 0) {
            activateCompletion(newSuggestions, newContext)
          } else {
            updateState({
              emptyDirMessage: `Directory is empty: ${selectedSuggestion.value}`
            })
            setTimeout(() => updateState({ emptyDirMessage: '' }), 3000)
          }
        }, 50)
      }
      
      return true
    }
    
    // Right arrow key - same as space but different semantics
    if (key.rightArrow) {
      const selectedSuggestion = state.suggestions[state.selectedIndex]
      const isDirectory = selectedSuggestion.value.endsWith('/')
      
      if (!state.context) return false
      
      // Apply completion
      const currentWordAtContext = input.slice(state.context.startPos, 
        state.context.startPos + selectedSuggestion.value.length)
      
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
            endPos: state.context.startPos + selectedSuggestion.value.length
          }
          
          const newSuggestions = generateSuggestions(newContext)
          
          if (newSuggestions.length > 0) {
            activateCompletion(newSuggestions, newContext)
          } else {
            updateState({
              emptyDirMessage: `Directory is empty: ${selectedSuggestion.value}`
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
          suppressUntil: Date.now() + suppressionTime
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
    
    const inputLengthChange = Math.abs(input.length - lastInputRef.current.length)
    const isHistoryNavigation = (
      inputLengthChange > 10 || // Large content change
      (inputLengthChange > 5 && !input.includes(lastInputRef.current.slice(-5))) // Different content
    ) && input !== lastInputRef.current
    
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
      } else if (newSuggestions.length === 1 && shouldAutoHideSingleMatch(newSuggestions[0], context)) {
        resetCompletion() // Perfect match - hide
      } else {
        activateCompletion(newSuggestions, context)
      }
    } else if (state.context) {
      // Check if context changed significantly
      const contextChanged = !context ||
        state.context.type !== context.type ||
        state.context.startPos !== context.startPos ||
        !context.prefix.startsWith(state.context.prefix)
      
      if (contextChanged) {
        resetCompletion()
      }
    }
  }, [input, cursorOffset])

  // Smart triggering - only when it makes sense
  const shouldAutoTrigger = useCallback((context: CompletionContext): boolean => {
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
        if (prefix.startsWith('/') || prefix.startsWith('~') || prefix.includes('/')) {
          return true
        }
        
        // Only trigger for extensions with reasonable filename length
        if (prefix.includes('.') && prefix.length >= 3) {
          return true
        }
        
        // Skip very short prefixes that are likely code (a.b, x.y)
        return false
      default:
        return false
    }
  }, [])

  // Helper function to determine if single suggestion should be auto-hidden
  const shouldAutoHideSingleMatch = useCallback((suggestion: UnifiedSuggestion, context: CompletionContext): boolean => {
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
      if (currentInput.endsWith('/' + suggestion.value) || currentInput.endsWith(suggestion.value)) {
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
  }, [input])

  return {
    suggestions,
    selectedIndex,
    isActive,
    emptyDirMessage,
  }
}