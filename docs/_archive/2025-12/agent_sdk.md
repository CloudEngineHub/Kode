# Agent SDK 设计文档（配套 Unix Coding Tools MCP）

> 目标：提供一个“client 侧适配层”（SDK），让任意 agent 主程序能够**完整使用 MCP 的高级能力**（roots/elicitation/resources subscribe/progress/logging），并把 MCP 工具结果中的结构化 `contextPatches/newMessages/reminders` 正确并一致地应用到对话编排，从而尽量对齐 Claude Code-like 的体验。

---

## 1. SDK 的定位与边界

### 1.1 SDK 解决什么问题

很多“普通 agent 框架”只支持最基础的 MCP：`tools/list` + `tools/call`，但 Claude Code-like 体验依赖：

- **server→client** 的 `roots/list`（工作区边界）
- **server→client** 的 `elicitation/create`（权限、plan mode 审批、AskUserQuestion）
- `resources/subscribe` + `notifications/resources/updated`（文件守护）
- `notifications/progress`（长任务进度）
- `notifications/message`（结构化日志）
- `initialize.instructions`（提示词/使用说明注入）

SDK 的核心任务：把这些“协议能力”在 client 侧补齐，并提供一套稳定的上层 API 给主程序使用。

### 1.2 SDK 不做什么

为保持通用性与可嵌入性，SDK 默认不直接做：

- LLM 采样（Anthropic/OpenAI/…）——可以提供适配接口，但不强绑定某一家
- UI 渲染（Ink/Web/IDE）——改为抽象回调，由宿主实现
- 多 agent 编排（TaskTool）——可提供 session 池工具，但编排属于宿主

### 1.3 SDK/Host vs MCP：能力边界（面向长期演进）

> 一个清晰的边界能保证：SDK 可以被 Web 插件/桌面客户端/云端后端复用；Unix Tools MCP 可以被任何 agent 复用；同时不破坏现有 agentic 运行机制。

| 能力                                     | 推荐归属                              | SDK 需要做什么                                                                       | 备注                    |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------- |
| 文件/终端/后台任务/kill/watch/checkpoint | MCP                                   | 仅负责调用与结果解析（tools/call）                                                   | MCP 是执行内核          |
| 权限审批/计划审批/AskUserQuestion        | MCP 发起；Host UI 承接                | 实现 `elicitation/create` handler，并把结果回传 server                               | 没 UI 的 client 需降级  |
| roots（工作区隔离）                      | Host 提供；SDK 响应                   | 实现 `roots/list` handler；必要时发 `roots/list_changed`                             | 多 workspace 必做       |
| 系统提醒（system reminders）             | SDK/Agent                             | 把 server instructions + 动态 reminders 注入模型 system                              | Claude Code-like 的关键 |
| plan mode 限制                           | MCP 维护状态 + 计划文件；SDK 注入提醒 | plan enforcement 在 Claude Code 更偏“软约束”，SDK 必须强注入提醒；MCP 可选 hard/soft | 参见 `unix_mcp.md`      |
| tool loop（模型↔工具递归）               | Agent/SDK（可选）                     | 可提供默认 ToolLoopRuntime，但不强制                                                 | 不应放进 MCP            |
| 多 agent/swarm 调度                      | Agent                                 | SDK 提供 session pool + 隔离键；编排由宿主决定                                       | MCP 只提供执行能力      |
| LLM 采样/模型路由/压缩摘要               | Agent                                 | SDK 提供 provider 适配接口                                                           | 不应放进 MCP            |

---

## 2. 高层架构

### 2.1 模块划分（推荐）

```
agent-sdk/
  transport/
    stdio.ts         # 启动/连接本地 stdio server
    sse.ts           # 连接 SSE server
  protocol/
    mcpClient.ts     # MCP Client 包装：请求/响应/通知路由、重连
    handlers.ts      # roots/list、elicitation/create 等 server->client 请求处理
  workspace/
    rootsManager.ts  # roots 管理（多 workspace）、roots/list_changed 通知
  tools/
    toolCatalog.ts   # tools/list 缓存、schema、annotations
    toolCaller.ts    # tools/call + progressToken + 结果解析
    envelope.ts      # ToolResultEnvelope 规范解析与校验
  context/
    contextState.ts  # AgentContextState：model、allowedTools、planMode、readTokens…
    patches.ts       # contextPatches/newMessages 的应用逻辑
    reminders.ts     # system reminders 拼装策略（含 plan mode）
  resources/
    resourcesClient.ts # resources/list/read/subscribe
    watchIndex.ts      # 本地订阅表、resource updated 处理（失效 token）
  permissions/
    permissionUI.ts     # elicitation form 的抽象接口（宿主实现）
  runtime/
    toolLoop.ts       # （可选）一套 Claude Code-like tool loop 执行器
    concurrency.ts    # 并发安全/队列（对齐 ToolSchema annotations）
  observability/
    logger.ts         # notifications/message 统一分发
    trace.ts          # trace 事件记录与导出
```

### 2.2 SDK 核心对象关系

- `McpConnection`：管理连接、重连、请求/通知。
- `RootsManager`：提供 roots 并响应 `roots/list`。
- `ElicitationBroker`：响应 `elicitation/create`，把 UI/用户输入交给宿主。
- `ToolCatalog`：缓存工具定义（schema/annotations），并提供给 LLM 侧的 tool 规格转换。
- `ToolCaller`：封装 `tools/call`，处理 progress/log、解析 `structuredContent` 结果。
- `ContextEngine`：维护 `AgentContextState` 并应用 `contextPatches/newMessages/reminders`。
- `ResourcesClient`：订阅资源更新并通知 `ContextEngine`（例如 readToken 失效）。
- （可选）`ToolLoopRuntime`：提供“模型调用 ↔ 工具调用 ↔ 递归迭代”的执行器。

---

## 3. 与 MCP Server 的握手与能力协商

### 3.1 Initialize：拉取 server instructions

SDK 在连接后执行：

1. `initialize`
2. `notifications/initialized`
3. 读取 `InitializeResult.instructions`（如果存在），存入 `ContextState.serverInstructions`

**关键策略**：SDK 必须提供“如何把 server instructions 注入模型 system prompt”的统一方法（见 §6）。

### 3.2 Roots：server 请求 roots/list

MCP 协议里 `roots/list` 是 server→client 请求。SDK 必须：

- 支持注册 handler：当收到 `roots/list` 时，返回当前 roots
- roots 由宿主提供（例如 Kode CLI 用当前 cwd；IDE 用 workspace folder）
- roots 变化时（用户切 workspace、增加目录），SDK 可发送 `notifications/roots/list_changed`

推荐 roots 表达：

- 仅使用 `file://` URI（协议要求）
- 允许多个 roots（多 workspace）

### 3.3 端到端交互模拟（协议层视角）

#### Flow A：普通改代码（stdio，一 agent 一进程）

1. `initialize` → SDK 缓存 `InitializeResult.instructions` 进入 `ContextState.serverInstructions`
2. server→client `roots/list` → SDK 从宿主读取 workspace roots 并返回
3. `tools/list` → SDK 构建 ToolCatalog（含 annotations）
4. 模型产出 tool calls → SDK `tools/call` → 解析 ToolResultEnvelope → 应用 `contextPatches/newMessages/reminders`
5. server→client `notifications/resources/updated` → SDK 更新订阅缓存、使 readTokens 失效并注入 reminder（避免 stale write）

#### Flow B：plan mode（进入→写 plan file→退出批准→执行）

1. 模型调用 `EnterPlanMode` → SDK `tools/call`
2. server→client `elicitation/create(meta.kind='plan.enter')` → SDK 触发宿主 UI → 返回 accept/decline
3. 若 accept：
   - SDK 将 `planMode.enabled=true` 写入 ContextState，并把 “plan mode active” 提醒注入 system（这是 Claude Code-like 的关键约束来源）
4. 模型用 `Write/Edit` 只编辑 plan file（MCP 可能在 hard 模式拒绝其它写）
5. 模型调用 `ExitPlanMode` → server→client `elicitation/create(meta.kind='plan.exit')`（审批计划 + 选择后续 permissionMode）
6. SDK 应用 `permissionMode` patch（default/acceptEdits/bypass）并退出 plan mode，随后进入实现阶段

---

## 4. Elicitation：把“权限/审批/问答”做成标准交互

### 4.1 为什么 SDK 必须实现 elicitation

Claude Code-like 的“用户审批”不是一条普通 tool output 文本，而是：

1. server 需要用户输入/同意
2. client 必须弹 UI
3. client 把用户选择作为 `ElicitResult` 返回
4. server 才继续执行/拒绝

没有 SDK 的 agent，很难通用实现这一套。

### 4.2 统一抽象：ElicitationBroker

SDK 提供一个宿主可实现的接口：

```ts
export type ElicitationHandler = (req: {
  mode: 'form' | 'url'
  message: string
  requestedSchema?: {
    // MCP 限制的“扁平 JSON schema 子集”
    properties: Record<
      string,
      {
        type: 'string' | 'number' | 'integer' | 'boolean' | 'array'
        enum?: string[]
        default?: any
        title?: string
        description?: string
      }
    >
    required?: string[]
  }
  url?: string
  elicitationId?: string
  meta?: Record<string, unknown>
}) => Promise<
  | {
      action: 'accept'
      content?: Record<string, string | number | boolean | string[]>
    }
  | { action: 'decline' }
  | { action: 'cancel' }
>
```

SDK 内部把该 handler 的返回值映射为 MCP `ElicitResult` 并响应 server。

### 4.3 常见 elicitation 场景模板（建议 SDK 内置）

为宿主减负，SDK 可以约定一套 `meta.kind`：

- `meta.kind = 'permission.read'`
- `meta.kind = 'permission.write'`
- `meta.kind = 'permission.shell.exec'`
- `meta.kind = 'plan.enter'`
- `meta.kind = 'plan.exit'`
- `meta.kind = 'ask_user_question'`

宿主 UI 可以根据 kind 选择更好的文案与交互。

---

## 5. ToolCatalog：工具定义获取与 LLM 侧转换

### 5.1 tools/list 缓存与变更

SDK 从 server 拉取 `tools/list` 并缓存：

- name/description
- inputSchema（JSON Schema）
- outputSchema（若 server 提供）
- annotations（readOnlyHint/destructiveHint/idempotentHint/openWorldHint）

如果 server 发 `notifications/tools/list_changed`，SDK 自动刷新。

### 5.2 转换为 LLM 工具规格（关键：跨模型）

不同模型 API 的 tool 规格不同。SDK 建议提供适配层：

#### Anthropic（tool_use）

- 把 MCP tool inputSchema 转成 Anthropics tools 的 `input_schema`
- 工具调用结果以 tool_result block 回传

#### OpenAI（tool calling / responses）

- 把 MCP tool inputSchema 转成 OpenAI functions schema
- 工具结果以 `tool` role message 回传（或 Responses API 的 tool output）

**SDK 的职责**：提供一个统一的 `ToolSpecAdapter`：

```ts
type LlmProvider = 'anthropic' | 'openai' | 'other'

interface ToolSpecAdapter {
  toLlmTools(tools: McpToolDef[]): any
  parseToolCalls(
    modelResponse: any,
  ): Array<{ id: string; name: string; args: any }>
  formatToolResults(results: ToolRunResult[]): any[] // 变成 provider 的消息块
}
```

---

## 6. ContextEngine：对齐 Claude Code-like 的“上下文联动”

### 6.1 为什么必须有 ContextEngine

Claude Code-like 系统不仅仅是“调用工具返回文本”，还依赖：

- `newMessages`：把展开的 prompt/元消息注入对话
- `contextModifier`：动态改写后续采样上下文（临时 allowed tools、模型切换等）
- system reminders：plan mode、todo、文件新鲜度提醒

在 MCP 化后，server 会把这些通过 `structuredContent` 返回（例如 `ToolResultEnvelope.contextPatches/newMessages`）。SDK 必须：

- 解析并校验 envelope
- 把补丁应用到“下一次模型采样输入”的 state

### 6.2 AgentContextState（推荐结构）

```ts
type AgentContextState = {
  serverInstructions?: string

  permissionMode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  planMode: { enabled: boolean; planFileUri?: string }

  model?: string // 当前模型指针/名称
  allowedTools: Set<string> // 临时/会话级工具白名单（例如 slash/skill 扩权）

  readTokens: Map<string /*abs path*/, string> // 用于 read-before-write

  reminders: Array<{
    type: string
    content: string
    priority: 'low' | 'medium' | 'high'
  }>
}
```

### 6.3 contextPatches 的应用规则

SDK 需要一个**可预测的优先级**：

1. server 强制（例如 planMode=true/false）
2. user 选择（例如 plan exit 后 permissionMode）
3. tool patch（例如 slash/skill 添加 allowedTools）
4. host 默认（例如初始模型选择）

并区分 patch scope：

- `turn`：只对下一次采样有效
- `session`：在会话内持续有效，直到被覆盖/清空

### 6.4 newMessages 的合并策略

`newMessages` 通常用于：

- SlashCommand/Skill 展开 prompt
- 追加“元消息”（command running…）

SDK 应提供：

- `injectNewMessages(messages, newMessages)`：保证顺序稳定，避免重复注入
- 可选“去重策略”（基于 meta hash）

### 6.5 system reminders 注入（plan mode 是核心）

SDK 要做到“尽量对齐 Claude Code”，必须在每次模型调用前构造：

- base system prompt（宿主提供）
- - server initialize.instructions（工具箱说明）
- - 动态 reminders（todo、文件变更、plan mode 限制）

注意：不同 LLM provider 对 system prompt 的载体不同：

- Anthropic：system 是独立字段/数组
- OpenAI：system 是 messages[0]

SDK 必须提供统一接口：

```ts
type SystemPromptBuildInput = {
  baseSystem: string[]
  state: AgentContextState
  recentMessages: Array<{ role: string; content: any }>
}

type SystemPromptBuildOutput = {
  system: string[] // 给 Anthropics
  messagesPrefix: any[] // 给 OpenAI（system message）
}
```

---

## 7. ResourcesClient：文件守护与 readToken 失效

### 7.1 订阅策略（建议）

SDK 可以提供自动订阅策略（可配）：

- 当 `Read(file)` 成功后，自动 `resources/subscribe(fileUri)`
- 当 `Write/Edit` 成功后，保持订阅（直到会话结束）
- 当用户显式切换 workspace/roots 时，清理订阅并重新订阅

### 7.2 notifications/resources/updated 的处理

当 server 通知某个 `file:///...` 更新：

- SDK 将对应 `readTokens[path]` 标记为 stale（或直接删除）
- 向宿主 UI 发事件（提示“文件已外部改动，需要重新读取”）
- （可选）向 reminders 增加一条高优先级提醒（供下一次模型采样）

---

## 8. ToolCaller：统一调用、进度、日志、错误模型

### 8.1 tools/call 包装

SDK 应提供：

```ts
type ToolCallOptions = {
  progress?: (p: { progress: number; total?: number; message?: string }) => void
  signal?: AbortSignal
}

type ToolRunResult = {
  toolName: string
  ok: boolean
  envelope?: ToolResultEnvelope
  contentText?: string
  isError: boolean
}

async function callTool(
  name: string,
  args: any,
  options?: ToolCallOptions,
): Promise<ToolRunResult>
```

### 8.2 progressToken 的用法

- SDK 为每次 `tools/call` 生成 `progressToken`
- 监听 `notifications/progress` 并路由到回调（或 UI）

### 8.3 logging 的用法

- 若 client 发送 `logging/setLevel`，server 会推 `notifications/message`
- SDK 统一转发到宿主 logger，并可写入 trace

### 8.4 错误处理建议

区分三类错误：

1. **协议/连接错误**（断线、超时、解析失败）→ SDK 抛异常，宿主决定重连/终止
2. **工具级错误**（`isError=true`）→ 作为 tool_result 返回给模型，让模型自修正
3. **权限/交互缺失**（需要 elicitation 但 client 不支持）→ SDK 返回结构化错误并给宿主明确下一步

---

## 9. （可选）ToolLoopRuntime：把“Claude Code-like tool loop”做成可复用引擎

> 如果宿主 agent 已有自己的 tool loop，可以不使用；但为了对齐 Claude Code，SDK 可以提供一套参考实现。

### 9.1 Tool loop 的基本流程

1. 组装 system prompt（含 server instructions + reminders）
2. 调用模型得到 response（含 tool calls）
3. 对 tool calls：
   - 按 concurrency safe 策略并发执行（或队列）
   - 处理 progress（UI）
4. 把 tool results 写回消息列表
5. 应用 context patches（模型/allowedTools/planMode）
6. 递归下一轮，直到模型输出最终回答

### 9.2 并发与顺序（对齐 Claude Code）

建议规则：

- `readOnlyHint=true` 的工具可并发（Read/Grep/Glob）
- `destructiveHint=true` 或未声明的工具默认串行（Write/Edit/Bash）
- 同一批 tool calls 中若出现一个 non-concurrency-safe，后续非安全工具排队

### 9.3 中断与取消

- SDK 对每轮 tool 执行维护 AbortController
- 当用户取消/拒绝关键权限时，取消同批其它 tool calls（对齐 Claude Code 的“兄弟工具调用取消”语义）

---

## 10. 多 agent / 多 workspace 的 SDK 设计

### 10.1 “不串”的推荐方式：每 agent 一个 SDK 实例 + 一个 MCP 连接

- `new UnixCodingAgentSession({ roots, transport })`
- 每个 session 有独立 state/readTokens/subscriptions

### 10.2 多 workspace

两种模式：

1. **单 session 多 roots**：一个 agent 需要跨多个目录工作
2. **多 session 单 root**：多个 agent 各自独立在同一 repo 工作（更安全，避免 readToken/后台进程混）

SDK 应同时支持两者，并让宿主选择。

---

## 11. Kode CLI 如何做到“用户感受 0 影响”的迁移路径（建议）

1. Kode CLI 继续负责 UI（Ink）与 LLM 调用（query.ts）
2. 把本地工具执行替换为 SDK：
   - `tools/list` 来自 MCP
   - `tools/call` 由 MCP 执行
3. 把权限 UI 从“本地 hasPermissionsToUseTool”迁移为“elicitation handler”
4. 把 `contextModifier` 改为 `contextPatches` 应用（模型切换、临时 allowed tools）
5. plan mode：
   - server 强制限制
   - SDK 负责把 plan mode reminder 注入 system prompt（保证模型遵守）

最终效果：Kode CLI 体验不变，但执行内核变成可发布、可复用的 unix MCP。

---

## 12. 开放问题（实现前必须定稿）

1. `ToolResultEnvelope` 版本化：如何兼容未来字段变更？（建议 `envelopeVersion`）
2. “模型切换”补丁的语义：SDK 只改“指针”还是直接改 provider/model？
3. 权限持久化策略：workspace vs user vs session，宿主是否需要 UI 让用户选择？
4. roots 动态扩展：当 server 发现 outside_roots 是否由 SDK 自动引导用户新增 root？
5. 对不支持 server→client 请求的宿主：SDK 是否提供“退化模式”（只能用基础 tools）？
