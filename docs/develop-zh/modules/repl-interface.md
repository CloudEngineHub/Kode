# REPL 界面模块

## 概述

REPL 模块（`ui/ink/src/screens/REPL.tsx`）提供了 Kode 的主要交互界面。它是一个复杂的基于 React 的终端 UI，处理用户输入、显示响应、管理对话状态，并编排整个交互体验。

## 架构

### 组件结构

```typescript
interface REPLProps {
  commands: Command[]
  initialPrompt?: string
  messageLogName: string
  shouldShowPromptInput: boolean
  verbose?: boolean
  tools: Tool[]
  safeMode?: boolean
  mcpClients?: MCPClient[]
  isDefaultModel: boolean
  initialMessages?: Message[]
  initialForkNumber?: number
}

export function REPL(props: REPLProps): JSX.Element {
  // 状态管理
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentModel, setCurrentModel] = useState<Model>()

  // 对话处理
  // UI 渲染
  // 事件处理器
}
```

## 状态管理

### 消息状态

```typescript
interface ConversationState {
  messages: Message[]
  pendingMessages: Message[]
  streamingContent: string
  currentToolUse?: ToolUse
  error?: Error
}

const useConversationState = () => {
  const [state, dispatch] = useReducer(conversationReducer, initialState)

  const addMessage = (message: Message) => {
    dispatch({ type: 'ADD_MESSAGE', payload: message })
  }

  const updateStreamingContent = (content: string) => {
    dispatch({ type: 'UPDATE_STREAMING', payload: content })
  }

  return { state, addMessage, updateStreamingContent }
}
```

### 模型状态

```typescript
const useModelState = () => {
  const [modelPointer, setModelPointer] = useState('main')
  const [modelProfile, setModelProfile] = useState<ModelProfile>()
  const [isDefaultModel, setIsDefaultModel] = useState(true)

  const switchModel = async (pointer: string) => {
    const profile = await resolveModelProfile(pointer)
    setModelProfile(profile)
    setModelPointer(pointer)
  }

  return { modelProfile, switchModel, isDefaultModel }
}
```

## 用户输入处理

### 提示输入组件

```typescript
const PromptInput: React.FC<{
  onSubmit: (input: string) => void
  isLoading: boolean
  multiline: boolean
}> = ({ onSubmit, isLoading, multiline }) => {
  const [value, setValue] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)

  const handleKeyPress = (key: string, event: KeyEvent) => {
    if (key === 'enter' && !event.shift) {
      if (!isLoading && value.trim()) {
        onSubmit(value)
        setValue('')
      }
    }
    // 处理其他键（箭头、退格等）
  }

  return (
    <Box flexDirection="column">
      <TextInput
        value={value}
        onChange={setValue}
        onKeyPress={handleKeyPress}
        placeholder={isLoading ? '处理中...' : '输入提示...'}
        isDisabled={isLoading}
      />
      {multiline && <MultilineEditor value={value} />}
    </Box>
  )
}
```

### 命令处理

```typescript
async function processUserInput(
  input: string,
  context: REPLContext,
): Promise<void> {
  // 检查斜杠命令
  if (input.startsWith('/')) {
    await handleSlashCommand(input, context)
    return
  }

  // 检查特殊快捷方式
  if (input === '!!') {
    await retryLastCommand(context)
    return
  }

  // 作为 AI 对话处理
  await handleAIConversation(input, context)
}
```

## 消息渲染

### 消息显示管道

```typescript
const MessageRenderer: React.FC<{
  message: Message
  verbose: boolean
}> = ({ message, verbose }) => {
  switch (message.type) {
    case 'user':
      return <UserMessage message={message} />

    case 'assistant':
      return <AssistantMessage message={message} verbose={verbose} />

    case 'tool_use':
      return <ToolUseMessage message={message} />

    case 'tool_result':
      return <ToolResultMessage message={message} />

    case 'error':
      return <ErrorMessage message={message} />

    default:
      return null
  }
}
```

### 流式响应显示

```typescript
const StreamingMessage: React.FC<{
  content: string
  isThinking?: boolean
}> = ({ content, isThinking }) => {
  const [displayContent, setDisplayContent] = useState('')
  const [cursor, setCursor] = useState(true)

  // 动画内容出现
  useEffect(() => {
    const chars = content.split('')
    let index = 0

    const interval = setInterval(() => {
      if (index < chars.length) {
        setDisplayContent(prev => prev + chars[index])
        index++
      } else {
        clearInterval(interval)
      }
    }, 10) // 打字动画速度

    return () => clearInterval(interval)
  }, [content])

  // 光标闪烁
  useEffect(() => {
    const interval = setInterval(() => {
      setCursor(prev => !prev)
    }, 500)

    return () => clearInterval(interval)
  }, [])

  return (
    <Box>
      <Text color={isThinking ? 'gray' : 'white'}>
        {displayContent}
        {cursor && '█'}
      </Text>
    </Box>
  )
}
```

## 对话管理

### 查询编排

```typescript
async function executeQuery(
  prompt: string,
  context: REPLContext,
): Promise<void> {
  const abortController = new AbortController()

  try {
    setIsLoading(true)

    // 添加用户消息
    const userMessage = createUserMessage(prompt)
    addMessage(userMessage)

    // 执行查询
    const stream = query({
      prompt,
      messages: context.messages,
      model: context.currentModel,
      tools: context.tools,
      abortSignal: abortController.signal,
      safeMode: context.safeMode,
    })

    // 处理流
    for await (const event of stream) {
      await processStreamEvent(event, context)
    }
  } catch (error) {
    handleQueryError(error, context)
  } finally {
    setIsLoading(false)
  }
}
```

### 流事件处理

```typescript
async function processStreamEvent(
  event: QueryStreamEvent,
  context: REPLContext,
): Promise<void> {
  switch (event.type) {
    case 'text_delta':
      updateStreamingContent(event.text)
      break

    case 'tool_request':
      await handleToolRequest(event.tool, context)
      break

    case 'tool_result':
      displayToolResult(event.result)
      break

    case 'thinking':
      if (context.showThinking) {
        displayThinking(event.content)
      }
      break

    case 'complete':
      finalizeResponse(context)
      break

    case 'error':
      handleStreamError(event.error, context)
      break
  }
}
```

## 工具集成

### 工具执行显示

```typescript
const ToolExecutionDisplay: React.FC<{
  toolUse: ToolUse
  status: 'pending' | 'running' | 'complete' | 'error'
}> = ({ toolUse, status }) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'pending': return '⏳'
      case 'running': return <Spinner />
      case 'complete': return '✅'
      case 'error': return '❌'
    }
  }

  return (
    <Box flexDirection="column" borderStyle="round" padding={1}>
      <Box>
        <Text bold>{getStatusIcon()} {toolUse.name}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dim>{JSON.stringify(toolUse.input, null, 2)}</Text>
      </Box>
      {status === 'complete' && (
        <Box marginTop={1}>
          <Text color="green">工具成功完成</Text>
        </Box>
      )}
    </Box>
  )
}
```

### 权限请求

```typescript
const PermissionRequestHandler: React.FC<{
  request: PermissionRequest
  onApprove: () => void
  onDeny: () => void
}> = ({ request, onApprove, onDeny }) => {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="yellow">
      <Text bold color="yellow">⚠️ 需要权限</Text>
      <Text>{request.description}</Text>

      {showDetails && (
        <Box marginTop={1}>
          <Text dim>{request.details}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <SelectInput
          items={[
            { label: '批准', value: 'approve' },
            { label: '拒绝', value: 'deny' },
            { label: '查看详情', value: 'details' }
          ]}
          onSelect={(item) => {
            switch (item.value) {
              case 'approve': onApprove(); break
              case 'deny': onDeny(); break
              case 'details': setShowDetails(true); break
            }
          }}
        />
      </Box>
    </Box>
  )
}
```

## UI 功能

### 键盘快捷键

```typescript
const useKeyboardShortcuts = (context: REPLContext) => {
  useInput((input, key) => {
    // 全局快捷键
    if (key.ctrl && input === 'c') {
      handleCancel(context)
    }

    if (key.ctrl && input === 'l') {
      clearScreen()
    }

    if (key.ctrl && input === 'r') {
      searchHistory(context)
    }

    // Vim 模式快捷键
    if (context.vimMode) {
      handleVimKeys(input, key, context)
    }
  })
}
```

### 状态栏

```typescript
const StatusBar: React.FC<{
  model: Model
  cost: number
  mode: 'normal' | 'safe'
  isLoading: boolean
}> = ({ model, cost, mode, isLoading }) => {
  return (
    <Box justifyContent="space-between" width="100%">
      <Box>
        <Text dim>模型：</Text>
        <Text color="cyan">{model.name}</Text>
      </Box>

      <Box>
        <Text dim>成本：</Text>
        <Text color={cost > 1 ? 'red' : 'green'}>${cost.toFixed(4)}</Text>
      </Box>

      <Box>
        {mode === 'safe' && <Text color="yellow">🛡️ 安全模式</Text>}
        {isLoading && <Spinner />}
      </Box>
    </Box>
  )
}
```

## 历史管理

### 对话历史

```typescript
class ConversationHistory {
  private history: Message[][] = []
  private currentIndex: number = -1

  save(messages: Message[]): void {
    this.history.push([...messages])
    this.currentIndex = this.history.length - 1
  }

  navigate(direction: 'prev' | 'next'): Message[] | null {
    if (direction === 'prev' && this.currentIndex > 0) {
      this.currentIndex--
      return this.history[this.currentIndex]
    }

    if (direction === 'next' && this.currentIndex < this.history.length - 1) {
      this.currentIndex++
      return this.history[this.currentIndex]
    }

    return null
  }

  search(query: string): Message[][] {
    return this.history.filter(messages =>
      messages.some(m => m.content.includes(query)),
    )
  }
}
```

### 日志持久化

```typescript
async function saveConversationLog(
  messages: Message[],
  logName: string,
): Promise<void> {
  const logPath = path.join(CACHE_DIR, 'messages', `${logName}.json`)

  const logData = {
    timestamp: new Date().toISOString(),
    messages: messages.map(sanitizeMessage),
    metadata: {
      model: getCurrentModel(),
      cost: calculateCost(messages),
      duration: getSessionDuration(),
    },
  }

  await fs.writeFile(logPath, JSON.stringify(logData, null, 2))
}
```

## 错误处理

### 错误显示

```typescript
const ErrorDisplay: React.FC<{ error: Error }> = ({ error }) => {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="red">
      <Text color="red" bold>❌ 错误</Text>
      <Text>{error.message}</Text>

      {showDetails && (
        <Box marginTop={1} flexDirection="column">
          <Text dim>堆栈跟踪：</Text>
          <Text dim wrap="wrap">{error.stack}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dim>
          按 'd' 查看详情，'r' 重试，'c' 继续
        </Text>
      </Box>
    </Box>
  )
}
```

### 恢复选项

```typescript
function handleError(error: Error, context: REPLContext): RecoveryAction {
  if (error.name === 'AbortError') {
    return { type: 'cancelled' }
  }

  if (error.name === 'RateLimitError') {
    return {
      type: 'switch_model',
      suggestion: '切换到不同的模型？',
    }
  }

  if (error.name === 'ContextLengthError') {
    return {
      type: 'compact_context',
      suggestion: '压缩对话历史？',
    }
  }

  return {
    type: 'retry',
    suggestion: '重试操作？',
  }
}
```

## 性能优化

### 虚拟滚动

```typescript
const MessageList: React.FC<{
  messages: Message[]
  height: number
}> = ({ messages, height }) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 })

  const handleScroll = (offset: number) => {
    const start = Math.floor(offset / MESSAGE_HEIGHT)
    const end = start + Math.ceil(height / MESSAGE_HEIGHT)
    setVisibleRange({ start, end })
  }

  const visibleMessages = messages.slice(
    visibleRange.start,
    visibleRange.end
  )

  return (
    <VirtualScroll
      height={height}
      itemCount={messages.length}
      itemHeight={MESSAGE_HEIGHT}
      onScroll={handleScroll}
    >
      {visibleMessages.map(msg => (
        <MessageRenderer key={msg.id} message={msg} />
      ))}
    </VirtualScroll>
  )
}
```

### 记忆化

```typescript
const MemoizedMessage = React.memo(MessageRenderer, (prevProps, nextProps) => {
  // 仅在消息内容更改时重新渲染
  return (
    prevProps.message.content === nextProps.message.content &&
    prevProps.verbose === nextProps.verbose
  )
})
```

REPL 模块提供了一个复杂、响应迅速和用户友好的 AI 对话界面，具有全面的状态管理、错误处理和性能优化。
