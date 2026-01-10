# Kode-CLI ACP 集成开发委托文档（Archived）

> Archived: 2024-12 外包/委托执行说明文档，包含大量旧路径与当时的实现假设，仅保留作历史参考。
> 当前 ACP 实现入口请以 `docs/acp.md`、`apps/kode/src/entrypoints/acp.ts` 与 `packages/host-acp/src/*` 为准。

> **文档版本**: v1.0
> **创建日期**: 2024-12-25
> **目标读者**: 初级程序员（AI 外包执行者）
> **预计工作量**: 3-5 天
> **技术栈**: TypeScript, Node.js, JSON-RPC 2.0

---

## 第一部分：项目背景与目标

### 1.1 什么是 ACP？

**ACP (Agent Client Protocol)** 是一个标准化协议，用于让 AI 编程助手（Agent）与代码编辑器/IDE（Client）之间进行通信。它类似于：

- **LSP (Language Server Protocol)**: 编辑器 ↔ 语言服务器
- **MCP (Model Context Protocol)**: Agent ↔ 外部工具/数据源
- **ACP (Agent Client Protocol)**: 编辑器 ↔ AI Agent

**核心价值**：任何实现了 ACP 协议的 Agent 都可以被任何支持 ACP 的 Client 使用，无需额外适配。

### 1.2 为什么 Kode-CLI 需要 ACP？

当前 Kode-CLI 是一个独立的终端 AI 编程助手，用户只能通过命令行交互。添加 ACP 支持后：

1. **Zed IDE 原生集成** - Zed 是 ACP 的发起者，原生支持 ACP Agent
2. **Toad TUI 集成** - 通用的终端 Agent 管理器
3. **JetBrains IDE 集成** - JetBrains 全家桶支持 ACP
4. **Neovim/Emacs 集成** - 通过插件支持 ACP
5. **未来扩展** - 任何新的 ACP Client 都可以直接使用 Kode

### 1.3 项目目标

**核心交付物**：

1. 新增 `kode-acp` 命令，作为 ACP 服务器运行
2. 实现 ACP 协议的所有必需方法
3. 确保与 Toad、Zed 等 ACP Client 无缝兼容

**成功标准**：

```bash
# 在 Toad 中运行
toad acp "kode-acp"

# 用户输入 prompt，Kode 响应，权限请求弹窗正常显示
```

---

## 第二部分：技术架构总览

### 2.1 当前 Kode-CLI 架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        当前 Kode-CLI 架构                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   用户终端                                                                   │
│      │                                                                      │
│      ▼                                                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  src/entrypoints/cli.tsx                                             │  │
│   │  - Commander.js 命令行解析                                            │  │
│   │  - 初始化配置、MCP、权限系统                                           │  │
│   │  - 启动 Ink (React) TUI 界面                                          │  │
│   └───────────────────────────────────┬─────────────────────────────────┘  │
│                                       │                                     │
│                                       ▼                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  src/query.ts                                                        │  │
│   │  - 核心对话循环                                                       │  │
│   │  - 消息管理、工具调用队列                                              │  │
│   │  - 权限检查 (canUseTool)                                              │  │
│   └───────────────────────────────────┬─────────────────────────────────┘  │
│                                       │                                     │
│                       ┌───────────────┼───────────────┐                     │
│                       ▼               ▼               ▼                     │
│   ┌───────────────────────┐  ┌───────────────┐  ┌───────────────────────┐  │
│   │  src/services/llm.ts  │  │ src/tools/*   │  │ src/permissions.ts   │  │
│   │  - LLM API 调用        │  │ - 工具实现     │  │ - 权限引擎            │  │
│   │  - 流式响应处理        │  │ - Bash/Read等  │  │ - 规则匹配            │  │
│   └───────────────────────┘  └───────────────┘  └───────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 目标架构：添加 ACP 入口

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        目标 Kode-CLI 架构 (含 ACP)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐                    ┌─────────────────┐               │
│   │  终端用户        │                    │  ACP Client     │               │
│   │  (原有方式)      │                    │  (Toad/Zed等)   │               │
│   └────────┬────────┘                    └────────┬────────┘               │
│            │                                      │                         │
│            ▼                                      ▼                         │
│   ┌─────────────────┐                    ┌─────────────────────────────┐   │
│   │ cli.tsx         │                    │ acp.ts (新增)                │   │
│   │ (原有入口)       │                    │ - stdin/stdout JSON-RPC     │   │
│   └────────┬────────┘                    │ - ACP 协议实现               │   │
│            │                             │ - 消息转换层                  │   │
│            │                             └──────────────┬──────────────┘   │
│            │                                            │                   │
│            └────────────────┬───────────────────────────┘                   │
│                             │                                               │
│                             ▼                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  src/acp/kode-agent.ts (新增)                                        │  │
│   │  - 桥接层：ACP 协议 <-> Kode 内部接口                                  │  │
│   │  - 会话管理                                                          │  │
│   │  - 权限代理                                                          │  │
│   └───────────────────────────────────┬─────────────────────────────────┘  │
│                                       │                                     │
│                                       ▼                                     │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  核心逻辑 (复用现有代码)                                               │  │
│   │  - query.ts (对话循环)                                                │  │
│   │  - llm.ts (LLM 调用)                                                  │  │
│   │  - tools/* (工具)                                                     │  │
│   │  - permissions.ts (权限)                                              │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 ACP 协议核心概念

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ACP 协议交互流程                                   │
└─────────────────────────────────────────────────────────────────────────────┘

 ACP Client (Toad/Zed)                                          Kode-ACP
        │                                                           │
        │  ══════════════ 阶段1: 初始化 ══════════════              │
        │                                                           │
        ├──► initialize {protocolVersion, clientCapabilities}  ────►│
        │◄── {protocolVersion, agentCapabilities, agentInfo}   ◄────┤
        │                                                           │
        │  ══════════════ 阶段2: 创建会话 ══════════════            │
        │                                                           │
        ├──► session/new {cwd, mcpServers}                     ────►│
        │◄── {sessionId, modes}                                ◄────┤
        │                                                           │
        │  ══════════════ 阶段3: 对话轮次 ══════════════            │
        │                                                           │
        ├──► session/prompt {content: [{type:"text", text:"..."}]} ►│
        │                                                           │
        │    [Kode 处理 prompt，调用 LLM，执行工具]                   │
        │                                                           │
        │◄── session/update {agent_message_chunk, content}     ◄────┤
        │◄── session/update {tool_call, toolCallId, title}     ◄────┤
        │◄── session/update {tool_call_update, status}         ◄────┤
        │                                                           │
        │  ══════════════ 权限请求 (当需要时) ══════════════         │
        │                                                           │
        │◄── session/request_permission {toolCall, options}    ◄────┤
        │                                                           │
        │    [Client 显示权限对话框，用户选择]                        │
        │                                                           │
        ├──► {outcome: {optionId: "allow_once"}}               ────►│
        │                                                           │
        │  ══════════════ 终端操作 (当需要时) ══════════════         │
        │                                                           │
        │◄── terminal/create {command, args, cwd}              ◄────┤
        ├──► {terminalId: "term_1"}                            ────►│
        │◄── terminal/output {terminalId}                      ◄────┤
        ├──► {output: "...", truncated: false}                 ────►│
        │◄── terminal/wait_for_exit {terminalId}               ◄────┤
        ├──► {exitCode: 0}                                     ────►│
        │                                                           │
        │  ══════════════ 对话轮次结束 ══════════════               │
        │                                                           │
        │◄── session/prompt response {stopReason: "end_turn"} ◄────┤
        │                                                           │
```

---

## 第三部分：详细实施计划

### 3.1 工作阶段概览

| 阶段      | 名称           | 目标                                   | 预计时间 |
| --------- | -------------- | -------------------------------------- | -------- |
| **阶段1** | 基础设施搭建   | 创建 ACP 模块目录结构、JSON-RPC 通信层 | 0.5 天   |
| **阶段2** | 协议实现       | 实现 ACP 协议所有方法                  | 1 天     |
| **阶段3** | Kode 桥接层    | 将 ACP 协议对接到 Kode 核心逻辑        | 1.5 天   |
| **阶段4** | 权限与终端     | 实现权限代理和终端操作                 | 0.5 天   |
| **阶段5** | CLI 入口与打包 | 添加 `kode-acp` 命令，更新构建配置     | 0.5 天   |
| **阶段6** | 测试与调试     | 与 Toad 集成测试，修复问题             | 1 天     |

---

## 第四部分：阶段1 - 基础设施搭建

### 4.1 目标

1. 创建 `src/acp/` 目录结构
2. 实现 JSON-RPC 2.0 通信层
3. 创建 ACP 协议类型定义

### 4.2 需要创建的文件

```
src/acp/
├── index.ts              # ACP 模块导出
├── jsonrpc.ts            # JSON-RPC 2.0 实现
├── protocol.ts           # ACP 协议类型定义
├── transport.ts          # stdin/stdout 传输层
├── kode-agent.ts         # Kode Agent 实现
└── utils.ts              # 工具函数
```

### 4.3 步骤1.1: 创建 JSON-RPC 通信层

**文件**: `src/acp/jsonrpc.ts`

**功能说明**:

- 实现 JSON-RPC 2.0 规范
- 支持请求、响应、通知三种消息类型
- 管理请求 ID 和回调

**关键代码**:

```typescript
// src/acp/jsonrpc.ts

/**
 * JSON-RPC 2.0 消息类型
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: JsonRpcError
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

/**
 * JSON-RPC 错误码
 */
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const

/**
 * JSON-RPC 服务器
 * 处理入站请求，管理方法注册
 */
export class JsonRpcServer {
  private methods: Map<string, (params: unknown) => Promise<unknown>> =
    new Map()
  private pendingRequests: Map<
    number | string,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
    }
  > = new Map()
  private nextId = 1

  /**
   * 注册一个 RPC 方法
   */
  registerMethod(
    name: string,
    handler: (params: unknown) => Promise<unknown>,
  ): void {
    this.methods.set(name, handler)
  }

  /**
   * 处理入站消息
   */
  async handleMessage(message: string): Promise<string | null> {
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: ErrorCodes.PARSE_ERROR, message: 'Parse error' },
      })
    }

    // 检查是否是响应
    if (this.isResponse(parsed)) {
      this.handleResponse(parsed as JsonRpcResponse)
      return null
    }

    // 处理请求
    if (this.isRequest(parsed)) {
      return await this.handleRequest(parsed as JsonRpcRequest)
    }

    return null
  }

  /**
   * 发送请求并等待响应
   */
  async sendRequest(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    const id = this.nextId++
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.send(request)
    })
  }

  /**
   * 发送通知（不期望响应）
   */
  sendNotification(method: string, params?: Record<string, unknown>): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    }
    this.send(notification)
  }

  /**
   * 发送消息到 stdout（子类可覆盖）
   */
  protected send(
    message: JsonRpcRequest | JsonRpcResponse | JsonRpcNotification,
  ): void {
    process.stdout.write(JSON.stringify(message) + '\n')
  }

  private isRequest(obj: unknown): boolean {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'method' in obj &&
      'id' in obj &&
      (obj as any).jsonrpc === '2.0'
    )
  }

  private isResponse(obj: unknown): boolean {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      ('result' in obj || 'error' in obj) &&
      'id' in obj &&
      (obj as any).jsonrpc === '2.0'
    )
  }

  private async handleRequest(request: JsonRpcRequest): Promise<string> {
    const handler = this.methods.get(request.method)

    if (!handler) {
      return JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: ErrorCodes.METHOD_NOT_FOUND,
          message: `Method not found: ${request.method}`,
        },
      })
    }

    try {
      const result = await handler(request.params)
      return JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        result,
      })
    } catch (error) {
      return JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: ErrorCodes.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Internal error',
        },
      })
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id as number | string)
    if (!pending) return

    this.pendingRequests.delete(response.id as number | string)

    if (response.error) {
      pending.reject(new Error(response.error.message))
    } else {
      pending.resolve(response.result)
    }
  }
}
```

### 4.4 步骤1.2: 创建 ACP 协议类型定义

**文件**: `src/acp/protocol.ts`

**功能说明**:

- 定义 ACP 协议所有类型
- 与官方 schema.json 对应

**关键代码**:

```typescript
// src/acp/protocol.ts

/**
 * ACP 协议版本
 */
export const PROTOCOL_VERSION = 1

/**
 * Client 能力
 */
export interface ClientCapabilities {
  fs?: {
    readTextFile?: boolean
    writeTextFile?: boolean
  }
  terminal?: boolean
}

/**
 * Agent 能力
 */
export interface AgentCapabilities {
  loadSession?: boolean
  promptCapabilities?: {
    image?: boolean
    audio?: boolean
    embeddedContent?: boolean
  }
}

/**
 * 实现信息
 */
export interface Implementation {
  name: string
  title?: string
  version: string
}

/**
 * 初始化请求参数
 */
export interface InitializeParams {
  protocolVersion: number
  clientCapabilities: ClientCapabilities
  clientInfo?: Implementation
}

/**
 * 初始化响应
 */
export interface InitializeResponse {
  protocolVersion: number
  agentCapabilities: AgentCapabilities
  agentInfo?: Implementation
  authMethods?: AuthMethod[]
}

export interface AuthMethod {
  id: string
  name: string
  description?: string
}

/**
 * 会话模式
 */
export interface SessionMode {
  id: string
  name: string
  description?: string
}

export interface SessionModeState {
  currentModeId: string
  availableModes: SessionMode[]
}

/**
 * 新建会话请求参数
 */
export interface NewSessionParams {
  cwd: string
  mcpServers?: McpServer[]
}

export interface McpServer {
  name: string
  command: string
  args?: string[]
  env?: EnvVariable[]
}

export interface EnvVariable {
  name: string
  value: string
}

/**
 * 新建会话响应
 */
export interface NewSessionResponse {
  sessionId: string
  modes?: SessionModeState
}

/**
 * 内容块类型
 */
export interface TextContent {
  type: 'text'
  text: string
}

export interface ImageContent {
  type: 'image'
  data: string
  mimeType: string
}

export interface ResourceLinkContent {
  type: 'resource_link'
  uri: string
  name: string
  mimeType?: string
}

export type ContentBlock = TextContent | ImageContent | ResourceLinkContent

/**
 * 会话 Prompt 请求
 */
export interface SessionPromptParams {
  sessionId: string
  content: ContentBlock[]
}

/**
 * 停止原因
 */
export type StopReason = 'end_turn' | 'max_tokens' | 'cancelled' | 'refusal'

/**
 * 会话 Prompt 响应
 */
export interface SessionPromptResponse {
  stopReason: StopReason
}

/**
 * 工具调用类型
 */
export type ToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'other'

export type ToolCallStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

/**
 * 工具调用内容
 */
export interface ToolCallContentText {
  type: 'content'
  content: TextContent
}

export interface ToolCallContentDiff {
  type: 'diff'
  path: string
  oldText?: string
  newText: string
}

export interface ToolCallContentTerminal {
  type: 'terminal'
  terminalId: string
}

export type ToolCallContent =
  | ToolCallContentText
  | ToolCallContentDiff
  | ToolCallContentTerminal

export interface ToolCallLocation {
  path: string
  line?: number
}

/**
 * 工具调用
 */
export interface ToolCall {
  toolCallId: string
  title: string
  kind?: ToolKind
  status?: ToolCallStatus
  content?: ToolCallContent[]
  locations?: ToolCallLocation[]
  rawInput?: Record<string, unknown>
  rawOutput?: Record<string, unknown>
}

/**
 * 会话更新类型
 */
export interface AgentMessageChunk {
  sessionUpdate: 'agent_message_chunk'
  content: ContentBlock
}

export interface AgentThoughtChunk {
  sessionUpdate: 'agent_thought_chunk'
  content: ContentBlock
}

export interface ToolCallUpdate {
  sessionUpdate: 'tool_call'
  toolCallId: string
  title: string
  kind?: ToolKind
  status?: ToolCallStatus
  content?: ToolCallContent[]
  locations?: ToolCallLocation[]
  rawInput?: Record<string, unknown>
}

export interface ToolCallStatusUpdate {
  sessionUpdate: 'tool_call_update'
  toolCallId: string
  status?: ToolCallStatus
  content?: ToolCallContent[]
  rawOutput?: Record<string, unknown>
}

export interface PlanEntry {
  content: string
  status?: 'pending' | 'in_progress' | 'completed'
  priority?: 'high' | 'medium' | 'low'
}

export interface PlanUpdate {
  sessionUpdate: 'plan'
  entries: PlanEntry[]
}

export interface CurrentModeUpdate {
  sessionUpdate: 'current_mode_update'
  currentModeId: string
}

export type SessionUpdate =
  | AgentMessageChunk
  | AgentThoughtChunk
  | ToolCallUpdate
  | ToolCallStatusUpdate
  | PlanUpdate
  | CurrentModeUpdate

/**
 * 会话更新通知参数
 */
export interface SessionUpdateParams {
  sessionId: string
  update: SessionUpdate
}

/**
 * 权限选项
 */
export type PermissionOptionKind =
  | 'allow_once'
  | 'allow_always'
  | 'reject_once'
  | 'reject_always'

export interface PermissionOption {
  optionId: string
  name: string
  kind: PermissionOptionKind
}

/**
 * 请求权限参数
 */
export interface RequestPermissionParams {
  sessionId: string
  toolCall: ToolCall
  options: PermissionOption[]
}

/**
 * 请求权限结果
 */
export interface RequestPermissionOutcome {
  outcome: 'selected' | 'cancelled'
  optionId?: string
}

export interface RequestPermissionResponse {
  outcome: RequestPermissionOutcome
}

/**
 * 终端相关
 */
export interface CreateTerminalParams {
  sessionId: string
  command: string
  args?: string[]
  cwd?: string
  env?: EnvVariable[]
  outputByteLimit?: number
}

export interface CreateTerminalResponse {
  terminalId: string
}

export interface TerminalOutputParams {
  sessionId: string
  terminalId: string
}

export interface TerminalExitStatus {
  exitCode?: number
  signal?: string
}

export interface TerminalOutputResponse {
  output: string
  truncated: boolean
  exitStatus?: TerminalExitStatus
}

export interface WaitForTerminalExitParams {
  sessionId: string
  terminalId: string
}

export interface WaitForTerminalExitResponse {
  exitCode?: number
  signal?: string
}

export interface KillTerminalParams {
  sessionId: string
  terminalId: string
}

export interface ReleaseTerminalParams {
  sessionId: string
  terminalId: string
}

/**
 * 文件系统相关
 */
export interface ReadTextFileParams {
  sessionId: string
  path: string
  line?: number
  limit?: number
}

export interface ReadTextFileResponse {
  content: string
}

export interface WriteTextFileParams {
  sessionId: string
  path: string
  content: string
}

/**
 * 会话取消
 */
export interface SessionCancelParams {
  sessionId: string
}

/**
 * 设置会话模式
 */
export interface SetSessionModeParams {
  sessionId: string
  modeId: string
}
```

### 4.5 步骤1.3: 创建传输层

**文件**: `src/acp/transport.ts`

**功能说明**:

- 处理 stdin 输入流
- 按行解析 JSON-RPC 消息
- 调用 JsonRpcServer 处理消息

**关键代码**:

```typescript
// src/acp/transport.ts

import * as readline from 'readline'
import { JsonRpcServer } from './jsonrpc'

/**
 * Stdio 传输层
 * 从 stdin 读取 JSON-RPC 消息，通过 stdout 发送响应
 */
export class StdioTransport {
  private server: JsonRpcServer
  private rl: readline.Interface | null = null

  constructor(server: JsonRpcServer) {
    this.server = server
  }

  /**
   * 启动传输层，开始监听 stdin
   */
  start(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    })

    this.rl.on('line', async line => {
      if (!line.trim()) return

      try {
        const response = await this.server.handleMessage(line)
        if (response) {
          process.stdout.write(response + '\n')
        }
      } catch (error) {
        // 错误已在 handleMessage 中处理
        console.error('Transport error:', error)
      }
    })

    this.rl.on('close', () => {
      process.exit(0)
    })

    // 禁用 stdout 缓冲
    if (process.stdout.setDefaultEncoding) {
      process.stdout.setDefaultEncoding('utf8')
    }
  }

  /**
   * 停止传输层
   */
  stop(): void {
    if (this.rl) {
      this.rl.close()
      this.rl = null
    }
  }
}
```

### 4.6 参考资料

在实现阶段1之前，请阅读以下参考资料：

| 参考项目                  | 文件路径                       | 需要关注的内容                      |
| ------------------------- | ------------------------------ | ----------------------------------- |
| **claude-code-acp**       | `src/index.ts`                 | ACP 入口结构                        |
| **claude-code-acp**       | `src/acp-agent.ts`             | Agent 实现方式                      |
| **codex-acp**             | `src/main.rs`                  | Rust 版 ACP 入口（理解逻辑）        |
| **agent-client-protocol** | `docs/protocol/overview.mdx`   | 协议概述                            |
| **agent-client-protocol** | `docs/protocol/transports.mdx` | 传输层规范                          |
| **toad**                  | `src/toad/jsonrpc.py`          | Python 版 JSON-RPC 实现（对比参考） |

---

## 第五部分：阶段2 - ACP 协议实现

### 5.1 目标

1. 实现所有 ACP 必需方法
2. 实现会话管理
3. 实现消息流式更新

### 5.2 步骤2.1: 创建 ACP Agent 核心类

**文件**: `src/acp/kode-agent.ts`

**功能说明**:

- 实现 ACP 协议方法
- 管理会话状态
- 桥接 Kode 核心逻辑

**关键代码**:

```typescript
// src/acp/kode-agent.ts

import { JsonRpcServer } from './jsonrpc'
import { StdioTransport } from './transport'
import * as Protocol from './protocol'
import { nanoid } from 'nanoid'
import { version } from '../../package.json'

// 导入 Kode 核心模块（后续阶段实现）
// import { KodeBridge } from './kode-bridge'

/**
 * Kode ACP Agent
 * 实现 ACP 协议，作为 Kode 的 ACP 服务器
 */
export class KodeACPAgent {
  private server: JsonRpcServer
  private transport: StdioTransport

  // 会话状态
  private sessions: Map<string, SessionState> = new Map()
  private clientCapabilities: Protocol.ClientCapabilities = {}

  // Kode 桥接（后续阶段实现）
  // private bridge: KodeBridge

  constructor() {
    this.server = new JsonRpcServer()
    this.transport = new StdioTransport(this.server)

    // 注册 ACP 方法
    this.registerMethods()
  }

  /**
   * 启动 ACP Agent
   */
  start(): void {
    this.transport.start()
  }

  /**
   * 注册所有 ACP 方法
   */
  private registerMethods(): void {
    // ==================== Agent 方法 ====================

    // 初始化
    this.server.registerMethod('initialize', this.handleInitialize.bind(this))

    // 会话管理
    this.server.registerMethod('session/new', this.handleSessionNew.bind(this))
    this.server.registerMethod(
      'session/prompt',
      this.handleSessionPrompt.bind(this),
    )
    this.server.registerMethod(
      'session/set_mode',
      this.handleSetMode.bind(this),
    )

    // 注意：session/cancel 是通知，不需要响应
    this.server.registerMethod(
      'session/cancel',
      this.handleSessionCancel.bind(this),
    )
  }

  /**
   * 处理 initialize 请求
   */
  private async handleInitialize(
    params: unknown,
  ): Promise<Protocol.InitializeResponse> {
    const { protocolVersion, clientCapabilities, clientInfo } =
      params as Protocol.InitializeParams

    // 存储 Client 能力
    this.clientCapabilities = clientCapabilities

    // 返回 Agent 能力
    return {
      protocolVersion: Protocol.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false, // 暂不支持会话恢复
        promptCapabilities: {
          image: false, // 暂不支持图片
          audio: false, // 暂不支持音频
          embeddedContent: true, // 支持嵌入资源
        },
      },
      agentInfo: {
        name: 'kode',
        title: 'Kode AI',
        version: version,
      },
      authMethods: [], // 暂不需要认证
    }
  }

  /**
   * 处理 session/new 请求
   */
  private async handleSessionNew(
    params: unknown,
  ): Promise<Protocol.NewSessionResponse> {
    const { cwd, mcpServers } = params as Protocol.NewSessionParams

    // 生成会话 ID
    const sessionId = `kode_${nanoid()}`

    // 创建会话状态
    const session: SessionState = {
      id: sessionId,
      cwd,
      mcpServers: mcpServers || [],
      currentMode: 'code',
      abortController: null,
    }
    this.sessions.set(sessionId, session)

    // 初始化 Kode 桥接（后续阶段实现）
    // await this.bridge.initSession(session)

    return {
      sessionId,
      modes: {
        currentModeId: 'code',
        availableModes: [
          { id: 'code', name: 'Code', description: 'Standard coding mode' },
          {
            id: 'plan',
            name: 'Plan',
            description: 'Planning mode - read-only exploration',
          },
        ],
      },
    }
  }

  /**
   * 处理 session/prompt 请求
   * 这是核心方法，需要调用 Kode 的 query 逻辑
   */
  private async handleSessionPrompt(
    params: unknown,
  ): Promise<Protocol.SessionPromptResponse> {
    const { sessionId, content } = params as Protocol.SessionPromptParams

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // 提取文本内容
    const textContent = content
      .filter((c): c is Protocol.TextContent => c.type === 'text')
      .map(c => c.text)
      .join('\n')

    // 创建 AbortController 用于取消
    session.abortController = new AbortController()

    try {
      // 调用 Kode 核心逻辑（后续阶段实现）
      // const result = await this.bridge.runPrompt(session, textContent, {
      //   onMessageChunk: (text) => this.sendMessageChunk(sessionId, text),
      //   onThoughtChunk: (text) => this.sendThoughtChunk(sessionId, text),
      //   onToolCall: (toolCall) => this.sendToolCall(sessionId, toolCall),
      //   onToolCallUpdate: (update) => this.sendToolCallUpdate(sessionId, update),
      //   requestPermission: (toolCall, options) => this.requestPermission(sessionId, toolCall, options),
      //   createTerminal: (params) => this.createTerminal(sessionId, params),
      //   abortSignal: session.abortController.signal
      // })

      // 临时：直接返回模拟响应
      await this.sendMessageChunk(sessionId, 'Hello from Kode ACP!')

      return {
        stopReason: 'end_turn',
      }
    } finally {
      session.abortController = null
    }
  }

  /**
   * 处理 session/cancel 通知
   */
  private async handleSessionCancel(params: unknown): Promise<void> {
    const { sessionId } = params as Protocol.SessionCancelParams

    const session = this.sessions.get(sessionId)
    if (session?.abortController) {
      session.abortController.abort()
    }
  }

  /**
   * 处理 session/set_mode 请求
   */
  private async handleSetMode(params: unknown): Promise<void> {
    const { sessionId, modeId } = params as Protocol.SetSessionModeParams

    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    session.currentMode = modeId

    // 通知 Client 模式已更新
    this.server.sendNotification('session/update', {
      sessionId,
      update: {
        sessionUpdate: 'current_mode_update',
        currentModeId: modeId,
      } as Protocol.CurrentModeUpdate,
    })
  }

  // ==================== 发送通知方法 ====================

  /**
   * 发送 Agent 消息块
   */
  private async sendMessageChunk(
    sessionId: string,
    text: string,
  ): Promise<void> {
    this.server.sendNotification('session/update', {
      sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text },
      } as Protocol.AgentMessageChunk,
    })
  }

  /**
   * 发送 Agent 思考块
   */
  private async sendThoughtChunk(
    sessionId: string,
    text: string,
  ): Promise<void> {
    this.server.sendNotification('session/update', {
      sessionId,
      update: {
        sessionUpdate: 'agent_thought_chunk',
        content: { type: 'text', text },
      } as Protocol.AgentThoughtChunk,
    })
  }

  /**
   * 发送工具调用
   */
  private async sendToolCall(
    sessionId: string,
    toolCall: Protocol.ToolCall,
  ): Promise<void> {
    this.server.sendNotification('session/update', {
      sessionId,
      update: {
        sessionUpdate: 'tool_call',
        ...toolCall,
      } as Protocol.ToolCallUpdate,
    })
  }

  /**
   * 发送工具调用更新
   */
  private async sendToolCallUpdate(
    sessionId: string,
    update: Partial<Protocol.ToolCall> & { toolCallId: string },
  ): Promise<void> {
    this.server.sendNotification('session/update', {
      sessionId,
      update: {
        sessionUpdate: 'tool_call_update',
        ...update,
      } as Protocol.ToolCallStatusUpdate,
    })
  }

  // ==================== Client 方法调用 ====================

  /**
   * 请求权限
   */
  async requestPermission(
    sessionId: string,
    toolCall: Protocol.ToolCall,
    options: Protocol.PermissionOption[],
  ): Promise<Protocol.RequestPermissionOutcome> {
    const response = (await this.server.sendRequest(
      'session/request_permission',
      {
        sessionId,
        toolCall,
        options,
      },
    )) as Protocol.RequestPermissionResponse

    return response.outcome
  }

  /**
   * 创建终端
   */
  async createTerminal(
    sessionId: string,
    params: Omit<Protocol.CreateTerminalParams, 'sessionId'>,
  ): Promise<string> {
    if (!this.clientCapabilities.terminal) {
      throw new Error('Client does not support terminal capability')
    }

    const response = (await this.server.sendRequest('terminal/create', {
      sessionId,
      ...params,
    })) as Protocol.CreateTerminalResponse

    return response.terminalId
  }

  /**
   * 获取终端输出
   */
  async getTerminalOutput(
    sessionId: string,
    terminalId: string,
  ): Promise<Protocol.TerminalOutputResponse> {
    return (await this.server.sendRequest('terminal/output', {
      sessionId,
      terminalId,
    })) as Protocol.TerminalOutputResponse
  }

  /**
   * 等待终端退出
   */
  async waitForTerminalExit(
    sessionId: string,
    terminalId: string,
  ): Promise<Protocol.WaitForTerminalExitResponse> {
    return (await this.server.sendRequest('terminal/wait_for_exit', {
      sessionId,
      terminalId,
    })) as Protocol.WaitForTerminalExitResponse
  }

  /**
   * 杀死终端
   */
  async killTerminal(sessionId: string, terminalId: string): Promise<void> {
    await this.server.sendRequest('terminal/kill', { sessionId, terminalId })
  }

  /**
   * 释放终端
   */
  async releaseTerminal(sessionId: string, terminalId: string): Promise<void> {
    await this.server.sendRequest('terminal/release', { sessionId, terminalId })
  }

  /**
   * 读取文件
   */
  async readTextFile(
    sessionId: string,
    path: string,
    options?: { line?: number; limit?: number },
  ): Promise<string> {
    if (!this.clientCapabilities.fs?.readTextFile) {
      throw new Error('Client does not support fs.readTextFile capability')
    }

    const response = (await this.server.sendRequest('fs/read_text_file', {
      sessionId,
      path,
      ...options,
    })) as Protocol.ReadTextFileResponse

    return response.content
  }

  /**
   * 写入文件
   */
  async writeTextFile(
    sessionId: string,
    path: string,
    content: string,
  ): Promise<void> {
    if (!this.clientCapabilities.fs?.writeTextFile) {
      throw new Error('Client does not support fs.writeTextFile capability')
    }

    await this.server.sendRequest('fs/write_text_file', {
      sessionId,
      path,
      content,
    })
  }
}

/**
 * 会话状态
 */
interface SessionState {
  id: string
  cwd: string
  mcpServers: Protocol.McpServer[]
  currentMode: string
  abortController: AbortController | null
}
```

### 5.3 参考资料

| 参考项目                  | 文件路径                           | 需要关注的内容    |
| ------------------------- | ---------------------------------- | ----------------- |
| **claude-code-acp**       | `src/acp-agent.ts`                 | 完整的 Agent 实现 |
| **agent-client-protocol** | `docs/protocol/initialization.mdx` | 初始化流程        |
| **agent-client-protocol** | `docs/protocol/session-setup.mdx`  | 会话设置          |
| **agent-client-protocol** | `docs/protocol/prompt-turn.mdx`    | Prompt 轮次       |
| **agent-client-protocol** | `docs/protocol/tool-calls.mdx`     | 工具调用          |

---

## 第六部分：阶段3 - Kode 桥接层

### 6.1 目标

1. 创建 Kode 核心逻辑的桥接层
2. 将 ACP 协议对接到现有的 query.ts
3. 处理消息转换和流式输出

### 6.2 核心挑战

当前 Kode 的 `query.ts` 设计用于 Ink TUI，有以下特点：

1. 使用 React 组件渲染输出
2. 工具调用通过 `setToolJSX` 显示进度
3. 权限通过交互式 UI 获取用户确认

ACP 模式需要：

1. 将输出转换为 `session/update` 通知
2. 工具调用状态通过 `tool_call` / `tool_call_update` 发送
3. 权限通过 `session/request_permission` 请求 Client 处理

### 6.3 步骤3.1: 创建桥接层核心

**文件**: `src/acp/kode-bridge.ts`

**功能说明**:

- 封装 Kode 核心逻辑调用
- 转换消息格式
- 处理流式输出

**关键代码**:

```typescript
// src/acp/kode-bridge.ts

import * as Protocol from './protocol'
import { Tool, ToolUseContext } from '../Tool'
import { getTools } from '../tools'
import { getGlobalConfig, getAnthropicApiKey } from '@utils/config'
import { getCwd, setCwd } from '@utils/state'
import { nanoid } from 'nanoid'

// 导入 query 相关模块
import { type Message, type UserMessage, type AssistantMessage } from '../query'
import { createUserMessage, normalizeMessagesForAPI } from '@utils/messages'
import { formatSystemPromptWithContext } from '@services/systemPrompt'

/**
 * Kode 桥接层回调接口
 */
export interface KodeBridgeCallbacks {
  onMessageChunk: (text: string) => Promise<void>
  onThoughtChunk: (text: string) => Promise<void>
  onToolCall: (toolCall: Protocol.ToolCall) => Promise<void>
  onToolCallUpdate: (
    update: Partial<Protocol.ToolCall> & { toolCallId: string },
  ) => Promise<void>
  requestPermission: (
    toolCall: Protocol.ToolCall,
    options: Protocol.PermissionOption[],
  ) => Promise<Protocol.RequestPermissionOutcome>
  createTerminal: (params: {
    command: string
    args?: string[]
    cwd?: string
  }) => Promise<string>
  getTerminalOutput: (
    terminalId: string,
  ) => Promise<Protocol.TerminalOutputResponse>
  waitForTerminalExit: (
    terminalId: string,
  ) => Promise<Protocol.WaitForTerminalExitResponse>
  killTerminal: (terminalId: string) => Promise<void>
  abortSignal: AbortSignal
}

/**
 * 会话状态
 */
interface BridgeSessionState {
  id: string
  cwd: string
  messages: Message[]
  tools: Tool[]
  currentMode: 'code' | 'plan'
  mcpClients: any[]
}

/**
 * Kode 桥接层
 * 将 ACP 协议桥接到 Kode 核心逻辑
 */
export class KodeBridge {
  private sessions: Map<string, BridgeSessionState> = new Map()

  /**
   * 初始化会话
   */
  async initSession(params: {
    sessionId: string
    cwd: string
    mcpServers?: Protocol.McpServer[]
  }): Promise<void> {
    const { sessionId, cwd, mcpServers } = params

    // 设置工作目录
    setCwd(cwd)

    // 获取可用工具
    const tools = await getTools()

    // 初始化 MCP 客户端（如果有）
    const mcpClients: any[] = []
    if (mcpServers && mcpServers.length > 0) {
      // TODO: 初始化 MCP 客户端
    }

    // 创建会话状态
    this.sessions.set(sessionId, {
      id: sessionId,
      cwd,
      messages: [],
      tools,
      currentMode: 'code',
      mcpClients,
    })
  }

  /**
   * 运行 Prompt
   */
  async runPrompt(
    sessionId: string,
    prompt: string,
    callbacks: KodeBridgeCallbacks,
  ): Promise<Protocol.StopReason> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    // 创建用户消息
    const userMessage = createUserMessage([{ type: 'text', text: prompt }])
    session.messages.push(userMessage)

    // 构建工具使用上下文
    const toolUseContext: ToolUseContext = {
      messageId: nanoid(),
      abortController: new AbortController(),
      readFileTimestamps: {},
      options: {
        tools: session.tools,
        verbose: false,
        safeMode: false,
        maxThinkingTokens: 10000,
        permissionMode: 'default',
        mcpClients: session.mcpClients,
        persistSession: false, // ACP 模式不需要本地会话持久化
        shouldAvoidPermissionPrompts: false, // 权限通过 ACP 请求
      },
    }

    // 创建 ACP 权限检查函数
    const canUseTool = this.createACPCanUseTool(sessionId, callbacks)

    try {
      // 调用 LLM 并处理响应
      const result = await this.queryWithCallbacks(
        session,
        toolUseContext,
        callbacks,
        canUseTool,
      )

      return result.stopReason
    } catch (error) {
      if (callbacks.abortSignal.aborted) {
        return 'cancelled'
      }
      throw error
    }
  }

  /**
   * 创建 ACP 权限检查函数
   */
  private createACPCanUseTool(
    sessionId: string,
    callbacks: KodeBridgeCallbacks,
  ) {
    return async (
      tool: Tool,
      input: unknown,
      context: ToolUseContext,
    ): Promise<{ allowed: boolean; reason?: string }> => {
      // 判断工具是否需要权限
      if (!tool.needsPermissions(input)) {
        return { allowed: true }
      }

      // 构建工具调用信息
      const toolCall: Protocol.ToolCall = {
        toolCallId: context.toolUseId || nanoid(),
        title: tool.userFacingName?.(input) || tool.name,
        kind: this.mapToolKind(tool.name),
        status: 'pending',
        rawInput: input as Record<string, unknown>,
      }

      // 构建权限选项
      const options: Protocol.PermissionOption[] = [
        { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
        {
          optionId: 'allow_always',
          name: 'Allow always',
          kind: 'allow_always',
        },
        { optionId: 'reject_once', name: 'Reject', kind: 'reject_once' },
      ]

      // 请求权限
      const outcome = await callbacks.requestPermission(toolCall, options)

      if (outcome.outcome === 'cancelled') {
        return { allowed: false, reason: 'Operation cancelled' }
      }

      if (
        outcome.optionId === 'reject_once' ||
        outcome.optionId === 'reject_always'
      ) {
        return { allowed: false, reason: 'Permission denied by user' }
      }

      return { allowed: true }
    }
  }

  /**
   * 映射工具类型到 ACP ToolKind
   */
  private mapToolKind(toolName: string): Protocol.ToolKind {
    const mapping: Record<string, Protocol.ToolKind> = {
      Bash: 'execute',
      Read: 'read',
      Write: 'edit',
      Edit: 'edit',
      Glob: 'search',
      Grep: 'search',
      WebFetch: 'fetch',
      WebSearch: 'search',
      Think: 'think',
    }
    return mapping[toolName] || 'other'
  }

  /**
   * 带回调的查询
   */
  private async queryWithCallbacks(
    session: BridgeSessionState,
    context: ToolUseContext,
    callbacks: KodeBridgeCallbacks,
    canUseTool: any,
  ): Promise<{ stopReason: Protocol.StopReason }> {
    // 这里需要实现核心查询逻辑
    // 调用 LLM，处理流式响应，执行工具调用

    // TODO: 从 query.ts 中提取并适配核心逻辑

    // 临时实现：直接发送消息
    await callbacks.onMessageChunk('Processing your request...')

    return { stopReason: 'end_turn' }
  }

  /**
   * 设置会话模式
   */
  setMode(sessionId: string, mode: 'code' | 'plan'): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.currentMode = mode
    }
  }

  /**
   * 取消会话
   */
  cancelSession(sessionId: string): void {
    // 触发 abort
    // 会话中的 abortController 应该被中止
  }
}
```

### 6.4 步骤3.2: 修改 query.ts 提取核心逻辑

**文件**: `src/query.ts`

**修改说明**:

- 提取核心查询逻辑到独立函数
- 使用抽象回调替代直接 UI 操作
- 保持原有 TUI 模式兼容

**修改前后流程对比**:

```
修改前（TUI 模式）:
┌───────────────┐
│   query.ts    │
│ ┌───────────┐ │     直接渲染
│ │ 用户输入   │─┼──────────────► Ink 组件
│ └───────────┘ │
│ ┌───────────┐ │     直接调用
│ │ LLM 响应   │─┼──────────────► setToolJSX()
│ └───────────┘ │
│ ┌───────────┐ │     Ink 交互
│ │ 权限检查   │─┼──────────────► useCanUseTool
│ └───────────┘ │
└───────────────┘

修改后（抽象模式）:
┌───────────────┐
│   query.ts    │
│ ┌───────────┐ │
│ │ 核心逻辑   │─┼──► QueryCallbacks (抽象接口)
│ └───────────┘ │         │
└───────────────┘         │
                          ├──► TUI 回调实现 (原有)
                          │
                          └──► ACP 回调实现 (新增)
```

**需要修改的关键位置**:

1. **提取消息发送回调** (约 query.ts:500-600)

```typescript
// 修改前
setToolJSX({ jsx: <ToolComponent />, shouldHidePromptInput: true })

// 修改后
callbacks.onToolProgress({ toolCallId, content, status })
```

2. **提取权限检查** (约 query.ts:300-400)

```typescript
// 修改前
const canUseTool = useCanUseTool(...)

// 修改后
const result = await callbacks.canUseTool(tool, input, context)
```

3. **提取流式输出** (约 llm.ts:200-400)

```typescript
// 修改前
console.log(chunk) // 或直接渲染

// 修改后
callbacks.onMessageChunk(chunk)
callbacks.onThoughtChunk(chunk)
```

### 6.5 步骤3.3: 创建 TUI 回调适配器

**文件**: `src/acp/tui-adapter.ts`

**功能说明**:

- 将抽象回调接口适配到现有 TUI 组件
- 保持原有 CLI 行为不变

**关键代码**:

```typescript
// src/acp/tui-adapter.ts

import { QueryCallbacks } from './query-callbacks'
import { SetToolJSXFn } from '../Tool'

/**
 * TUI 模式的回调适配器
 * 将抽象回调转换为 Ink 组件操作
 */
export function createTUICallbacks(
  setToolJSX: SetToolJSXFn,
  canUseToolFn: any,
): QueryCallbacks {
  return {
    onMessageChunk: async text => {
      // 原有的消息渲染逻辑
      process.stdout.write(text)
    },

    onThoughtChunk: async text => {
      // 原有的思考渲染逻辑
      // 可能需要特殊格式化
    },

    onToolProgress: async progress => {
      // 调用 setToolJSX
      // setToolJSX({ jsx: <ToolComponent {...progress} />, ... })
    },

    canUseTool: async (tool, input, context) => {
      // 使用原有的权限检查 Hook
      return canUseToolFn(tool, input, context)
    },

    // ... 其他回调
  }
}
```

### 6.6 参考资料

| 参考项目            | 文件路径                     | 需要关注的内容      |
| ------------------- | ---------------------------- | ------------------- |
| **Kode-cli**        | `src/query.ts`               | 核心查询循环 (重点) |
| **Kode-cli**        | `src/services/llm.ts`        | LLM 调用和流式处理  |
| **Kode-cli**        | `src/permissions.ts`         | 权限检查逻辑        |
| **Kode-cli**        | `src/hooks/useCanUseTool.ts` | 权限 Hook 实现      |
| **claude-code-acp** | `src/acp-agent.ts:56-120`    | canUseTool 回调实现 |

---

## 第七部分：阶段4 - 权限与终端

### 7.1 目标

1. 实现 ACP 权限代理
2. 实现终端操作代理
3. 处理文件系统操作

### 7.2 步骤4.1: 权限代理实现

**文件**: `src/acp/permission-proxy.ts`

**功能说明**:

- 将 Kode 的权限请求转换为 ACP 权限请求
- 处理权限响应并返回给 Kode

**关键代码**:

```typescript
// src/acp/permission-proxy.ts

import * as Protocol from './protocol'
import { Tool } from '../Tool'

/**
 * ACP 权限选项映射
 */
export function createPermissionOptions(
  tool: Tool,
  input: unknown,
): Protocol.PermissionOption[] {
  // 基本选项
  const options: Protocol.PermissionOption[] = [
    {
      optionId: 'allow_once',
      name: 'Allow once',
      kind: 'allow_once',
    },
    {
      optionId: 'reject_once',
      name: 'Reject',
      kind: 'reject_once',
    },
  ]

  // 某些工具支持 "总是允许"
  if (canAllowAlways(tool.name)) {
    options.splice(1, 0, {
      optionId: 'allow_always',
      name: 'Allow always',
      kind: 'allow_always',
    })
  }

  return options
}

/**
 * 判断工具是否支持 "总是允许"
 */
function canAllowAlways(toolName: string): boolean {
  // Read/Glob/Grep 等只读工具通常可以总是允许
  const alwaysAllowable = ['Read', 'Glob', 'Grep', 'WebSearch']
  return alwaysAllowable.includes(toolName)
}

/**
 * 将 ACP 权限结果转换为 Kode 格式
 */
export function convertPermissionOutcome(
  outcome: Protocol.RequestPermissionOutcome,
): { allowed: boolean; savePreference?: 'always' | 'never' } {
  if (outcome.outcome === 'cancelled') {
    return { allowed: false }
  }

  switch (outcome.optionId) {
    case 'allow_once':
      return { allowed: true }
    case 'allow_always':
      return { allowed: true, savePreference: 'always' }
    case 'reject_once':
      return { allowed: false }
    case 'reject_always':
      return { allowed: false, savePreference: 'never' }
    default:
      return { allowed: false }
  }
}

/**
 * 构建工具调用信息用于权限请求
 */
export function buildToolCallForPermission(
  tool: Tool,
  input: unknown,
  toolCallId: string,
): Protocol.ToolCall {
  const toolCall: Protocol.ToolCall = {
    toolCallId,
    title: tool.userFacingName?.(input) || tool.name,
    kind: mapToolKind(tool.name),
    status: 'pending',
    rawInput: input as Record<string, unknown>,
  }

  // 添加位置信息（如果是文件操作）
  if (hasFilePath(input)) {
    toolCall.locations = [
      { path: (input as any).file_path || (input as any).path },
    ]
  }

  // 添加命令信息（如果是 Bash）
  if (tool.name === 'Bash' && (input as any).command) {
    toolCall.content = [
      {
        type: 'content',
        content: {
          type: 'text',
          text: `Command: ${(input as any).command}`,
        },
      },
    ]
  }

  return toolCall
}

function mapToolKind(toolName: string): Protocol.ToolKind {
  const mapping: Record<string, Protocol.ToolKind> = {
    Bash: 'execute',
    Read: 'read',
    Write: 'edit',
    Edit: 'edit',
    Glob: 'search',
    Grep: 'search',
    WebFetch: 'fetch',
    WebSearch: 'search',
    Think: 'think',
    NotebookEdit: 'edit',
    FileRead: 'read',
    FileWrite: 'edit',
    FileEdit: 'edit',
  }
  return mapping[toolName] || 'other'
}

function hasFilePath(input: unknown): boolean {
  return (
    typeof input === 'object' &&
    input !== null &&
    ('file_path' in input || 'path' in input)
  )
}
```

### 7.3 步骤4.2: 终端代理实现

**文件**: `src/acp/terminal-proxy.ts`

**功能说明**:

- 将 Kode 的 Bash 命令执行转换为 ACP 终端操作
- 管理终端生命周期

**关键代码**:

```typescript
// src/acp/terminal-proxy.ts

import * as Protocol from './protocol'

/**
 * 终端代理
 * 管理通过 ACP Client 创建的终端
 */
export class TerminalProxy {
  private terminals: Map<string, TerminalState> = new Map()

  private createTerminal: (
    params: Protocol.CreateTerminalParams,
  ) => Promise<string>
  private getOutput: (
    terminalId: string,
  ) => Promise<Protocol.TerminalOutputResponse>
  private waitForExit: (
    terminalId: string,
  ) => Promise<Protocol.WaitForTerminalExitResponse>
  private kill: (terminalId: string) => Promise<void>
  private release: (terminalId: string) => Promise<void>

  constructor(callbacks: {
    createTerminal: (params: Protocol.CreateTerminalParams) => Promise<string>
    getOutput: (terminalId: string) => Promise<Protocol.TerminalOutputResponse>
    waitForExit: (
      terminalId: string,
    ) => Promise<Protocol.WaitForTerminalExitResponse>
    kill: (terminalId: string) => Promise<void>
    release: (terminalId: string) => Promise<void>
  }) {
    this.createTerminal = callbacks.createTerminal
    this.getOutput = callbacks.getOutput
    this.waitForExit = callbacks.waitForExit
    this.kill = callbacks.kill
    this.release = callbacks.release
  }

  /**
   * 执行命令
   * 替代 Kode 原有的 BunShell 执行
   */
  async executeCommand(
    sessionId: string,
    command: string,
    options?: {
      cwd?: string
      env?: Record<string, string>
      timeout?: number
    },
  ): Promise<{
    output: string
    exitCode: number
    truncated: boolean
  }> {
    // 解析命令和参数
    const [cmd, ...args] = this.parseCommand(command)

    // 创建终端
    const terminalId = await this.createTerminal({
      sessionId,
      command: cmd,
      args,
      cwd: options?.cwd,
      env: options?.env
        ? Object.entries(options.env).map(([name, value]) => ({ name, value }))
        : undefined,
    })

    this.terminals.set(terminalId, {
      id: terminalId,
      sessionId,
      command,
      startTime: Date.now(),
    })

    try {
      // 等待命令完成
      const exitResult = await this.waitForExit(terminalId)

      // 获取输出
      const outputResult = await this.getOutput(terminalId)

      return {
        output: outputResult.output,
        exitCode: exitResult.exitCode ?? 1,
        truncated: outputResult.truncated,
      }
    } finally {
      // 释放终端
      await this.release(terminalId)
      this.terminals.delete(terminalId)
    }
  }

  /**
   * 启动后台命令
   */
  async startBackgroundCommand(
    sessionId: string,
    command: string,
    options?: { cwd?: string },
  ): Promise<string> {
    const [cmd, ...args] = this.parseCommand(command)

    const terminalId = await this.createTerminal({
      sessionId,
      command: cmd,
      args,
      cwd: options?.cwd,
    })

    this.terminals.set(terminalId, {
      id: terminalId,
      sessionId,
      command,
      startTime: Date.now(),
      isBackground: true,
    })

    return terminalId
  }

  /**
   * 获取后台命令输出
   */
  async getBackgroundOutput(terminalId: string): Promise<string> {
    const result = await this.getOutput(terminalId)
    return result.output
  }

  /**
   * 杀死后台命令
   */
  async killBackground(terminalId: string): Promise<void> {
    await this.kill(terminalId)
    await this.release(terminalId)
    this.terminals.delete(terminalId)
  }

  /**
   * 解析命令字符串为命令和参数
   */
  private parseCommand(command: string): string[] {
    // 简单实现：按空格分割
    // 实际应该使用 shell-quote 等库
    return command.split(/\s+/).filter(Boolean)
  }
}

interface TerminalState {
  id: string
  sessionId: string
  command: string
  startTime: number
  isBackground?: boolean
}
```

### 7.4 参考资料

| 参考项目                  | 文件路径                         | 需要关注的内容 |
| ------------------------- | -------------------------------- | -------------- |
| **agent-client-protocol** | `docs/protocol/tool-calls.mdx`   | 权限请求协议   |
| **agent-client-protocol** | `docs/protocol/terminals.mdx`    | 终端协议       |
| **toad**                  | `src/toad/acp/agent.py:193-235`  | 权限请求实现   |
| **toad**                  | `src/toad/acp/agent.py:269-357`  | 终端操作实现   |
| **Kode-cli**              | `src/tools/BashTool/BashTool.ts` | Bash 工具实现  |
| **Kode-cli**              | `src/utils/BunShell.ts`          | Shell 执行实现 |

---

## 第八部分：阶段5 - CLI 入口与打包

### 8.1 目标

1. 添加 `kode-acp` CLI 命令
2. 更新 package.json
3. 更新构建脚本

### 8.2 步骤5.1: 创建 ACP 入口文件

**文件**: `src/entrypoints/acp.ts`

**功能说明**:

- ACP 服务器入口
- 解析命令行参数
- 启动 KodeACPAgent

**关键代码**:

```typescript
#!/usr/bin/env node
// src/entrypoints/acp.ts

import { KodeACPAgent } from '../acp/kode-agent'

/**
 * Kode ACP 服务器入口
 *
 * 使用方式:
 *   kode-acp              # 标准 ACP 模式
 *   kode-acp --debug      # 调试模式
 */
async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2)
  const debug = args.includes('--debug') || args.includes('-d')

  if (debug) {
    // 启用调试日志（输出到 stderr）
    process.env.KODE_ACP_DEBUG = '1'
  }

  // 检查环境
  if (process.stdin.isTTY) {
    console.error(
      'Error: kode-acp must be run with stdin piped (not interactive)',
    )
    console.error(
      'Usage: This command is designed to be called by an ACP client',
    )
    console.error('Example: toad acp "kode-acp"')
    process.exit(1)
  }

  // 创建并启动 Agent
  const agent = new KodeACPAgent()

  // 处理进程信号
  process.on('SIGINT', () => {
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    process.exit(0)
  })

  // 启动 Agent
  agent.start()
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
```

### 8.3 步骤5.2: 更新 package.json

**文件**: `package.json`

**修改内容**:

```json
{
  "bin": {
    "kode": "cli.js",
    "kwa": "cli.js",
    "kd": "cli.js",
    "kode-acp": "cli-acp.js" // 新增
  },
  "files": [
    "cli.js",
    "cli-acp.js", // 新增
    "yoga.wasm",
    "dist/**/*",
    "vendor/**/*",
    "scripts/binary-utils.cjs",
    "scripts/cli-wrapper.cjs",
    "scripts/postinstall.js",
    ".npmrc"
  ]
}
```

### 8.4 步骤5.3: 创建 ACP CLI 包装脚本

**文件**: `cli-acp.js`

**关键代码**:

```javascript
#!/usr/bin/env node
// cli-acp.js - Kode ACP CLI wrapper

const { spawn } = require('child_process')
const path = require('path')

// 确定入口文件路径
const entryPoint = path.join(__dirname, 'dist', 'entrypoints', 'acp.js')

// 启动 ACP 服务器
const child = spawn(process.execPath, [entryPoint, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', code => {
  process.exit(code || 0)
})
```

### 8.5 步骤5.4: 更新构建脚本

**文件**: `scripts/build.mjs`

**需要添加的内容**:

```javascript
// 添加 ACP 入口点构建
await esbuild.build({
  entryPoints: ['src/entrypoints/acp.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/entrypoints/acp.js',
  external: ['@anthropic-ai/sdk', 'openai', ...],
  // ... 其他配置与现有入口相同
})
```

### 8.6 步骤5.5: 创建 ACP 模块导出

**文件**: `src/acp/index.ts`

**关键代码**:

```typescript
// src/acp/index.ts

export * from './protocol'
export * from './jsonrpc'
export * from './transport'
export * from './kode-agent'
export * from './kode-bridge'
export * from './permission-proxy'
export * from './terminal-proxy'

// 版本信息
export const ACP_VERSION = 1
```

### 8.7 参考资料

| 参考项目            | 文件路径            | 需要关注的内容 |
| ------------------- | ------------------- | -------------- |
| **claude-code-acp** | `package.json`      | npm 包配置     |
| **claude-code-acp** | `src/index.ts`      | 入口结构       |
| **Kode-cli**        | `cli.js`            | 现有 CLI 包装  |
| **Kode-cli**        | `scripts/build.mjs` | 现有构建脚本   |

---

## 第九部分：阶段6 - 测试与调试

### 9.1 目标

1. 与 Toad 进行集成测试
2. 验证所有 ACP 方法正常工作
3. 修复发现的问题

### 9.2 测试步骤

#### 9.2.1 本地测试

```bash
# 1. 构建项目
cd /path/to/Kode-cli
npm run build

# 2. 本地链接
npm link

# 3. 测试 ACP 命令是否可用
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{}}}' | kode-acp

# 预期输出:
# {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{...},"agentInfo":{...}}}
```

#### 9.2.2 Toad 集成测试

```bash
# 1. 安装 Toad
pip install toad

# 2. 运行 Kode 通过 Toad
toad acp "kode-acp"

# 3. 在 Toad 界面中:
#    - 输入 prompt
#    - 验证响应正常显示
#    - 验证工具调用显示
#    - 验证权限请求弹窗
```

#### 9.2.3 测试清单

| 测试项   | 操作                  | 预期结果                 |
| -------- | --------------------- | ------------------------ |
| 初始化   | 发送 initialize       | 返回 agentCapabilities   |
| 创建会话 | 发送 session/new      | 返回 sessionId           |
| 简单问答 | 发送 "Hello"          | 收到 agent_message_chunk |
| 代码问题 | 发送 "list files"     | 收到 tool_call (Bash)    |
| 权限请求 | 触发需权限操作        | 收到 request_permission  |
| 取消操作 | 发送 session/cancel   | 操作被中止               |
| 模式切换 | 发送 session/set_mode | 模式切换成功             |

### 9.3 调试技巧

```bash
# 启用调试日志
KODE_ACP_DEBUG=1 kode-acp 2>debug.log

# 查看 JSON-RPC 通信
# 在 jsonrpc.ts 中添加:
console.error('IN:', line)
console.error('OUT:', response)
```

### 9.4 常见问题排查

| 问题           | 可能原因         | 解决方案                |
| -------------- | ---------------- | ----------------------- |
| 无响应         | stdin 未正确连接 | 检查进程启动方式        |
| JSON 解析错误  | 输出包含非 JSON  | 确保 stdout 只写 JSON   |
| 权限请求无响应 | Client 不支持    | 检查 clientCapabilities |
| 工具调用失败   | 权限被拒绝       | 检查权限配置            |

---

## 第十部分：文件清单与代码结构

### 10.1 新增文件清单

```
src/acp/
├── index.ts                 # 模块导出
├── jsonrpc.ts               # JSON-RPC 2.0 实现
├── protocol.ts              # ACP 协议类型定义
├── transport.ts             # stdin/stdout 传输层
├── kode-agent.ts            # Kode ACP Agent 实现
├── kode-bridge.ts           # Kode 核心逻辑桥接层
├── permission-proxy.ts      # 权限代理
├── terminal-proxy.ts        # 终端代理
└── tui-adapter.ts           # TUI 回调适配器

src/entrypoints/
└── acp.ts                   # ACP 入口文件

根目录:
├── cli-acp.js               # ACP CLI 包装脚本
└── package.json             # (修改) 添加 bin 配置
```

### 10.2 需要修改的现有文件

| 文件                  | 修改类型 | 修改内容               |
| --------------------- | -------- | ---------------------- |
| `package.json`        | 添加     | bin.kode-acp, files    |
| `scripts/build.mjs`   | 添加     | ACP 入口构建配置       |
| `src/query.ts`        | 重构     | 提取核心逻辑到回调模式 |
| `src/services/llm.ts` | 重构     | 提取流式输出到回调模式 |

### 10.3 代码量估计

| 模块                | 新增代码行数 | 说明          |
| ------------------- | ------------ | ------------- |
| jsonrpc.ts          | ~150         | JSON-RPC 核心 |
| protocol.ts         | ~350         | 类型定义      |
| transport.ts        | ~50          | 传输层        |
| kode-agent.ts       | ~400         | Agent 实现    |
| kode-bridge.ts      | ~300         | 桥接层        |
| permission-proxy.ts | ~100         | 权限代理      |
| terminal-proxy.ts   | ~150         | 终端代理      |
| acp.ts (入口)       | ~50          | 入口文件      |
| **总计**            | **~1550**    | 新增代码      |

---

## 第十一部分：关键参考资料索引

### 11.1 必读资料（按阅读顺序）

| 顺序 | 资料        | 路径                                                     | 目的            |
| ---- | ----------- | -------------------------------------------------------- | --------------- |
| 1    | ACP 介绍    | `agent-client-protocol/docs/overview/introduction.mdx`   | 理解 ACP 概念   |
| 2    | 协议概述    | `agent-client-protocol/docs/protocol/overview.mdx`       | 理解方法和流程  |
| 3    | 初始化      | `agent-client-protocol/docs/protocol/initialization.mdx` | 理解初始化流程  |
| 4    | 会话设置    | `agent-client-protocol/docs/protocol/session-setup.mdx`  | 理解会话管理    |
| 5    | Prompt 轮次 | `agent-client-protocol/docs/protocol/prompt-turn.mdx`    | 理解对话流程    |
| 6    | 工具调用    | `agent-client-protocol/docs/protocol/tool-calls.mdx`     | 理解工具协议    |
| 7    | 传输层      | `agent-client-protocol/docs/protocol/transports.mdx`     | 理解 stdio 规范 |

### 11.2 参考实现（按相关性排序）

| 优先级 | 项目            | 关键文件                | 参考目的              |
| ------ | --------------- | ----------------------- | --------------------- |
| **高** | claude-code-acp | `src/acp-agent.ts`      | 完整 Agent 实现       |
| **高** | claude-code-acp | `src/index.ts`          | 入口结构              |
| 中     | codex-acp       | `src/main.rs`           | Rust 实现对比         |
| 中     | codex-acp       | `src/codex_agent.rs`    | Agent 逻辑            |
| 中     | toad            | `src/toad/acp/agent.py` | Client 如何调用 Agent |
| 中     | toad            | `src/toad/jsonrpc.py`   | JSON-RPC 实现参考     |
| 低     | goose           | `crates/goose-acp/`     | 另一种实现方式        |

### 11.3 Kode-cli 必读文件

| 文件                         | 目的             |
| ---------------------------- | ---------------- |
| `src/entrypoints/cli.tsx`    | 理解现有入口结构 |
| `src/query.ts`               | 理解核心查询循环 |
| `src/Tool.ts`                | 理解工具接口     |
| `src/permissions.ts`         | 理解权限系统     |
| `src/services/llm.ts`        | 理解 LLM 调用    |
| `src/hooks/useCanUseTool.ts` | 理解权限 Hook    |

---

## 第十二部分：验收标准

### 12.1 功能验收

| 功能点   | 验收条件                               |
| -------- | -------------------------------------- |
| ACP 命令 | `kode-acp` 命令可执行                  |
| 初始化   | 返回正确的 agentCapabilities           |
| 会话创建 | 返回有效的 sessionId                   |
| 对话     | 用户输入能得到 AI 响应                 |
| 流式输出 | agent_message_chunk 正确发送           |
| 工具调用 | tool_call 和 tool_call_update 正确发送 |
| 权限请求 | request_permission 正确触发            |
| 取消操作 | session/cancel 能中止操作              |

### 12.2 兼容性验收

| Client   | 验收条件                       |
| -------- | ------------------------------ |
| Toad     | `toad acp "kode-acp"` 正常工作 |
| 原有 CLI | `kode` 命令行为不变            |

### 12.3 代码质量

- [ ] TypeScript 类型正确，无 any 滥用
- [ ] 错误处理完善
- [ ] 代码注释清晰
- [ ] 遵循现有项目代码风格

---

## 附录 A：术语表

| 术语        | 解释                                             |
| ----------- | ------------------------------------------------ |
| ACP         | Agent Client Protocol，AI Agent 与编辑器通信协议 |
| JSON-RPC    | 基于 JSON 的远程过程调用协议                     |
| Agent       | 实现 ACP 的 AI 助手程序                          |
| Client      | 实现 ACP 的编辑器/IDE                            |
| Session     | 一次对话会话                                     |
| Prompt Turn | 一轮对话（用户输入 → Agent 响应）                |
| Tool Call   | Agent 执行的工具调用                             |
| stdio       | 标准输入/输出流                                  |

---

## 附录 B：故障排除指南

### B.1 编译错误

```
问题: 找不到模块 '@acp/protocol'
解决: 检查 tsconfig.json 中的 paths 配置
```

### B.2 运行时错误

```
问题: "Session not found"
解决: 确保先调用 session/new 再调用 session/prompt
```

```
问题: "Client does not support terminal capability"
解决: 检查 initialize 中 clientCapabilities.terminal 是否为 true
```

### B.3 通信错误

```
问题: Toad 无响应
解决:
1. 检查 stdout 是否只输出 JSON
2. 检查消息是否以 \n 结尾
3. 运行 `kode-acp --debug` 查看日志
```

---

**文档结束**

_本文档为 Kode-CLI ACP 集成的完整外包开发委托文档，包含所有必要的背景知识、技术细节和实施步骤。执行者应按阶段顺序完成开发，每个阶段完成后进行测试验证。_
