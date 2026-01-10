# Unix Coding Tools MCP（Claude Code-like）设计文档

> 目标：把“在本机/工作区内安全执行文件与终端相关能力”的**执行内核**封装为一个通用 MCP Server（可发布到 npm），让任何支持 MCP 的 agent/模型都能通过挂载该 MCP 获得接近 Claude Code 的工具能力；同时确保**多连接隔离、权限可控、可观察、可回滚**。

---

## 1. 设计总览

### 1.1 设计原则

1. **Server 负责“做事 + 安全裁决 + 状态一致性”**
   - 文件读写、补丁应用、终端执行、后台任务、文件监听、checkpoint、权限/沙箱、plan mode 等都由 server 真正执行与裁决。
2. **Client/Agent 负责“对话编排 + UI + 模型选择 + system prompt 注入”**
   - MCP 不保证下游一定把 server 的提醒以 `system` 角色注入模型；因此 SDK（或主程序）要负责把 server 的 `instructions / reminders / contextPatch` 正确合并到模型输入。
3. **可序列化、可审计、可重放（trace-first）**
   - 所有跨边界副作用都必须能以结构化事件记录，支持复盘与验收。
4. **默认最小权限（deny-by-default）**
   - 默认仅允许操作 client 提供的 roots（工作区），工作区外访问必须显式扩权。
5. **每连接独立 session**
   - 不同 agent 连接的“后台进程、权限缓存、read token、plan mode、watchers 订阅”等绝不串。

### 1.2 范围（Scope）

#### In-scope（必须做）

- 文件工具：`Read / Glob / Grep / Write / Edit / MultiEdit / NotebookEdit`
- Shell 工具：`Bash / BashOutput / KillShell`（要求 Bun 内置 spawn/shell）
- 权限与交互：基于 MCP `elicitation/create` 完成“用户确认/授权”
- 工作区隔离：基于 MCP `roots/list` 完成每连接 roots 约束
- 文件守护：基于 MCP `resources/subscribe` 与 `notifications/resources/updated` 对齐“文件改动提醒”
- Plan mode：进入/退出与强制限制（仅允许计划文件写入）
- Checkpoint/影子 Git：写操作前可自动 checkpoint，并可恢复
- 可观测性：日志（`notifications/message`）、进度（`notifications/progress`）

#### Optional（可配置）

- Web：`WebFetch / WebSearch`（open-world、网络策略与审计）
- Slash/Skill：以 `prompts` 暴露为主（或兼容 tool）
- MCP 代理：作为“连接其它 MCP server”的桥接能力（更复杂，建议后置）
- Hook：server 事件触发脚本（安全边界极严，建议分阶段）

#### Out-of-scope（不建议塞进通用 unix 工具箱）

- LLM 采样（MCP `sampling`）：会把 server 变成 agent，破坏“工具箱”边界
- 高层任务编排（TaskTool、multi-agent team）：属于 agent 主程序

### 1.3 MCP vs Agent/SDK：职责边界（裁决矩阵）

> 目标：让“任何普通 agent/裸模型”通过挂载 MCP 就能获得 Claude Code-like 的工具能力，但同时避免把 **编排/对话/模型侧逻辑** 塞进 MCP，导致难以复用与难以保证一致性。

| 能力                                     | 推荐归属                                      | 原因（精简版）                                                                                  | 备注                           |
| ---------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| 文件读写/patch/路径规范化/symlink 防逃逸 | MCP                                           | 属于“执行内核 + 安全裁决”                                                                       | 必须做                         |
| 终端执行/后台任务/kill/输出截断          | MCP                                           | 需要强隔离与资源限制                                                                            | 必须做（Bun spawn/shell）      |
| 权限确认/审批 UI                         | Agent/Host UI                                 | MCP 只能发起 `elicitation/create`，UI 必须在 client                                             | SDK 提供抽象接口               |
| roots（工作区边界）                      | Agent/Host 提供；MCP 执行裁决                 | MCP 通过 `roots/list` 获取 roots；client 才知道 workspace                                       | 必须用 roots 实现隔离          |
| 文件守护（watch）与变更通知              | MCP                                           | watcher 需要与执行内核同侧，才能做到 token 失效与审计一致                                       | client 订阅资源                |
| 提示词/工具说明（Tool Manual）           | MCP 提供 + Agent 注入                         | MCP 通过 `initialize.instructions`/`prompts/get` 提供；是否注入 system 由 agent 决定            | 两侧都要配合                   |
| plan mode（进入/退出/计划文件）          | MCP 负责状态+计划文件；Agent 负责系统提醒注入 | plan mode 的“限制”在 Claude Code 更像软约束（system reminder），但 MCP 可选择更硬的 fail-closed | 见 §5.4                        |
| 多 agent 编排（Task / swarm / team）     | Agent                                         | 属于“调度/对话编排”，放 MCP 会把 MCP 变成 agent                                                 | MCP 仅提供“可被调用的执行能力” |
| LLM 采样/思考策略/反思 loop              | Agent                                         | MCP 做采样会导致嵌套 agent、权限边界混乱                                                        | 明确 out-of-scope              |

---

## 2. 部署与运行形态

### 2.1 形态 A：stdio（推荐默认）

**一个 agent = 一个 MCP 连接 = 一个 server 进程**  
启动方式示例：

```bash
bunx unix-coding-mcp --transport stdio
```

特点：

- 进程级隔离（最简单、最安全、不串 session）
- 非常适合本地 CLI（Kode CLI、终端 agent、编辑器内 agent）
- 缺点：多个 agent 会启动多个进程（通常可接受）

### 2.2 形态 B：SSE daemon + 每连接 session（高级）

启动方式示例：

```bash
bunx unix-coding-mcp --transport sse --port 7337
```

特点：

- 一个 daemon 承载多个连接 session
- 必须严格实现：**sessionId → 状态隔离**
- 适合：同机器多客户端共享一个 server（但仍要隔离）

### 2.3 形态 C：远程托管（仅适用于 workspace 在服务端）

如果 workspace 在本机但 MCP 在远端托管，文件/终端能力无法安全直连（除非另有隧道/文件同步）。  
因此远程托管仅建议用于：

- Codespace / devcontainer / 远程机器上运行 server，并把 agent 也放在同处
- 或者提供“remote fs proxy”（复杂，通常不值）

---

## 3. MCP 协议能力的“充分利用”映射

### 3.1 Tools（工具）

- `tools/list`：列出工具（含 inputSchema、可选 outputSchema、annotations）
- `tools/call`：执行工具
- `notifications/progress`：长任务进度（与 `progressToken` 绑定）

### 3.2 Resources（资源与文件守护）

- `resources/list`：列出可读资源（可按 root/订阅情况动态变化）
- `resources/read`：读取资源
- `resources/templates/list`：提供模板（例如目录递归、glob 视图）
- `resources/subscribe`：订阅资源更新
- `notifications/resources/updated`：资源变更通知

### 3.3 Prompts（提示词模板）

- `prompts/list`：列出提示词模板（slash/skills、工作流模板）
- `prompts/get`：拉取模板并渲染（可传参）

### 3.4 Roots（工作区）

MCP 支持 **server→client** 请求 `roots/list`，client 返回 `file://...` roots：

- server 以 roots 为边界实现**默认沙箱**
- 多 workspace：client 返回多个 root

### 3.5 Elicitation（向用户索取交互输入）

MCP 支持 **server→client** `elicitation/create`（form/url）：

- 用于权限请求（读/写/执行/网络/open-world）
- 用于 plan mode 进入/退出审批
- 用于 AskUserQuestion（如果希望由 server 主动问用户）

### 3.6 Logging（可观测性）

server 可以通过 `notifications/message` 向 client 发结构化日志：

- 便于 UI 展示与调试
- 便于持久化 trace

### 3.7 端到端交互模拟（普通 agent ↔ Unix Tools MCP）

#### Flow A：普通改代码（非 plan mode）

1. **连接与握手**
   - client 启动 `bunx unix-coding-mcp --transport stdio`
   - `initialize` → client `notifications/initialized`
   - server→client `roots/list` → client 返回 `{roots:[file:///repo]}`（每个 agent/工作区不同）
2. **工具发现**
   - client `tools/list` → 得到 `Read/Edit/Write/Grep/Glob/Bash/...`（含 JSON schema）
3. **Read → Edit/Write（read-before-write 可选）**
   - agent 调 `Read {file_path}` → server 返回 `{content, etag/readToken}`
   - agent 调 `Edit {file_path, old_string, new_string, readToken?}` → server 校验权限 +（可选）校验 readToken
4. **文件变更提醒**
   - client `resources/subscribe file:///repo/...`（或模板订阅目录）
   - server 发现变化 → `notifications/resources/updated`（含新 etag），SDK 将旧 readToken 标记失效并注入 reminder

#### Flow B：plan mode（进入 → 写 plan file → 退出批准 → 执行）

1. agent 调 `EnterPlanMode {}`
2. server→client `elicitation/create`（用户确认进入 plan mode）
3. 用户同意后：
   - server 进入 `planMode.enabled=true`
   - server 返回 `planFileUri`（例如 `file:///.../plans/<slug>.md`）
   - SDK/agent 在 system prompt 注入“plan mode active：只读探索 + 仅允许编辑 plan file”
4. agent 只做只读工具（Read/Grep/Glob/Web\*），并通过 `Write/Edit` **只写 plan file**
5. agent 调 `ExitPlanMode {launchSwarm?, teammateCount?}`
6. server 读取 plan file → server→client `elicitation/create`（用户审批计划 + 选择后续权限模式）
7. 用户批准后：
   - server 退出 plan mode，并返回 `planText + chosenPermissionMode`
   - agent 进入实现阶段（Write/Edit/Bash）

---

## 4. Session 隔离模型（核心）

### 4.1 每连接 = 一个 SessionContext

无论 stdio 还是 SSE：

- **每条连接**都有独立 `SessionContext`
- 所有 state 都挂在 session 上，禁止全局单例共享（除非严格按 session 分片）

建议 SessionContext（概念模型）：

```ts
type SessionContext = {
  sessionId: string
  client: { name?: string; version?: string; capabilities: object }

  roots: Array<{ uri: string; name?: string }>
  policy: {
    sandbox: {
      denyOutsideRoots: boolean
      followSymlinks: 'deny' | 'allow-within-root-only'
      maxFileBytes: number
      maxToolOutputBytes: number
    }
    permissions: PermissionState
    planMode: PlanModeState
    network: { enabled: boolean; allowHosts?: string[] }
  }

  fs: {
    readTokens: Map<string /*abs path*/, string /*etag*/>
    watchers: WatchRegistry
  }

  shell: {
    processes: Map<string /*processId*/, ProcessState>
  }

  checkpoints: {
    enabled: boolean
    storeDir: string
    stack: Array<CheckpointRef>
  }

  telemetry: {
    enabled: boolean
    events: Array<TelemetryEvent>
  }
}
```

### 4.2 “不串”的强约束清单

- `processId` 仅在同一 session 有效（KillShell 不能杀别的 session 的进程）
- `readToken` 仅在同一 session 有效（避免跨 agent 复用旧 read 导致误写）
- 权限授权可区分：
  - session 临时授权（只对当前 session）
  - workspace 永久授权（写入 workspace 配置文件）
  - user/global 授权（写入全局配置）
- 资源订阅只向订阅该 URI 的 session 发送更新通知

---

## 5. 安全与权限体系

### 5.1 Roots 沙箱（默认边界）

**默认 policy：只允许访问 roots 内路径**  
实现要点：

- 所有入参路径统一规范化（绝对化、解析 `..`、处理分隔符）
- 解析 symlink：必须防止“symlink 逃逸 root”
  - 推荐：对每次访问，取 `realpath` 后再判断是否仍在 root 内

### 5.2 权限请求（Elicitation 驱动）

server 在执行可能产生副作用/越权的动作前：

1. 先做静态判定：是否需要读/写/exec/net 权限
2. 若需授权：
   - 如果 client 支持 `elicitation`：发 `elicitation/create(form)` 请求用户决定
   - 否则：返回 tool 结果 `isError=true` + `structuredContent.permissionRequired=true`，提示 agent 在对话里询问用户，再调用 `permissions/grant`（fallback 工具）

#### 推荐的“权限粒度”维度

- 文件：read / write / watch
- Shell：exec（按命令前缀/子命令前缀）、background exec、kill
- 网络：fetch/search（open-world）
- 升权：允许 root 外路径（新增 root）

### 5.3 权限规则表达（可持久化）

建议兼容 Claude Code 的“工具 key”思想，但更结构化：

```jsonc
{
  "workspace": {
    "allowedPaths": {
      "read": ["file:///repo"],
      "write": ["file:///repo"],
    },
    "allowedShell": [
      { "prefix": "git status", "scope": "workspace" },
      { "prefix": "git diff", "scope": "workspace" },
      { "prefix": "bun test", "scope": "session" },
    ],
    "allowedTools": ["Read", "Grep", "Glob", "Bash"],
  },
}
```

### 5.4 Plan Mode（强制限制）

目标：对齐 Claude Code 的“计划阶段只读+只允许编辑 plan file”。

#### 语义

- `EnterPlanMode`：需要用户确认；进入后：
  - 除 plan file 外，禁止所有写操作、shell exec、配置修改等
  - 允许：`Read/Glob/Grep/WebSearch/WebFetch/AskUserQuestion/TodoWrite` 等（可配置）
  - 允许对 plan file 的 `Write/Edit`（仅该文件）
- `ExitPlanMode`：读取 plan file 并请求用户批准；用户可选择：
  - 继续 plan（拒绝）
  - 批准并选择后续权限模式（default/acceptEdits/bypass）

#### 与 Claude Code 真相源的对齐说明（重要）

Claude Code 运行时的 `plan` 更像是“**软约束**”：

- `EnterPlanMode` 主要是 `setMode(mode:"plan")` + 注入 system reminder（`cli.js:2749`，见 `Claude_Code_Agent_Tool_System_final/14_web_interaction_plan_tools.md`）
- 文件写权限引擎并不会对 `mode==="plan"` 自动 deny（`cli.js:4477` 的 `PQA(...)` 仅对 `acceptEdits` 有自动 allow 分支）
- plan file 之所以可写，靠的是“当前 session 主 plan file 特权”（`S$9(absPath) => absPath === oC()`，`cli.js:4477`）

因此：如果目标是 **bit-level 行为复刻**，plan mode 的执行约束主要依赖 agent 遵守 system reminder；如果目标是 **安全优先的通用 MCP 工具箱**，建议提供两种策略：

- `planMode.enforcement = "soft"`：尽量贴近 Claude Code（只做提醒 + 计划文件特权）
- `planMode.enforcement = "hard"`：fail-closed（除 plan file 外拒绝所有写/exec）

---

## 6. 结果协议：ToolResultEnvelope（关键互操作）

### 6.1 为什么需要 structuredContent

Claude Code 内部工具常见返回：`data + newMessages + contextModifier`。  
在 MCP 中，跨进程必须是 JSON，因此我们用 `structuredContent` 返回统一封装：

- 让 Agent SDK 能稳定解析与应用（消息注入、context patch、计划文件路径等）
- 同时用 `content` 给“只理解文本的客户端/模型”提供降级信息

### 6.2 推荐统一结构

```ts
type ToolResultEnvelope = {
  ok: boolean
  tool: string
  sessionId: string

  // 主要数据（工具特定）
  data?: unknown

  // 给 LLM 的文本输出（可选，通常与 content 对齐）
  assistantText?: string

  // Claude Code-like 的“额外消息注入”
  newMessages?: Array<{
    role: 'system' | 'user' | 'assistant'
    content:
      | string
      | Array<{
          type: 'text' | 'image'
          text?: string
          data?: string
          mimeType?: string
        }>
    meta?: Record<string, unknown>
  }>

  // 替代 contextModifier 的“可序列化补丁”
  contextPatches?: Array<
    | { op: 'set'; key: 'model'; value: string }
    | {
        op: 'add'
        key: 'allowedTools'
        value: string[]
        scope: 'session' | 'turn'
      }
    | {
        op: 'set'
        key: 'permissionMode'
        value: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
      }
    | { op: 'set'; key: 'planMode'; value: boolean }
  >

  // read-before-write token / etag
  readTokens?: Record<string /*abs path*/, string>

  // 结构化事件（用于 trace/telemetry/hook）
  events?: Array<{ type: string; timestamp: number; payload: any }>

  warnings?: string[]
  errors?: Array<{ code: string; message: string; details?: any }>
}
```

### 6.3 MCP CallToolResult 组合方式

- `CallToolResult.content`：用于展示文本（也便于模型理解）
- `CallToolResult.structuredContent`：填 `ToolResultEnvelope`
- `CallToolResult.isError`：当 `ok=false` 时置 true（建议仍用 tool result 方式，不抛协议级错误）

---

## 7. 工具清单与详细语义（超详细）

> 说明：这里以“Claude Code 兼容命名”为主（`Read/Edit/Write/...`）。实现上可同时提供 `unix__*` 前缀别名，避免与其它 server 冲突。

### 7.1 文件读取：`Read`

#### 目的

读取文本文件/图片/（可选）二进制摘要，返回内容并生成 `readToken` 用于后续写保护。

#### 输入（概念 schema）

```ts
type ReadInput = {
  file_path: string // 绝对路径或相对 root 的路径（建议 client 传绝对）
  offset?: number // 行偏移
  limit?: number // 行数限制
}
```

#### 输出（structuredContent.data）

```ts
type ReadOutput =
  | {
      kind: 'text'
      filePath: string
      content: string
      numLines: number
      truncated: boolean
    }
  | {
      kind: 'image'
      filePath: string
      mimeType: string
      base64: string
      bytes: number
    }
```

#### 关键语义

- 权限：需要 read 权限（若 `file_path` 不在 roots，直接拒绝）
- 读取后：
  - 生成 `readToken`（建议用 `mtimeMs + size + hash` 或 ETag），存入 session 的 `readTokens[path]`
  - 可触发 `events: file:read`

#### 失败条件（示例）

- `outside_roots`
- `permission_denied`
- `file_not_found`
- `file_too_large`

---

### 7.2 文件搜索：`Glob` / `Grep`

#### `Glob`

- 输入：`pattern`（glob）、`path`（起始目录，默认 root）、`ignore`（可选）
- 输出：匹配文件列表（绝对路径）
- 权限：read（目录）

#### `Grep`

- 输入：`pattern`（正则或字符串）、`path`、`include/exclude`、`max_results`
- 输出：命中位置（file, line, preview）
- 权限：read

#### 进度

大目录 grep 可发 `notifications/progress`（按扫描文件数）

---

### 7.3 写入与编辑：`Write` / `Edit` / `MultiEdit`

#### 核心要求：read-before-write

对齐 Kode/Claude Code：写之前必须读，且文件不能在读后被外部改动。

**推荐机制：readToken（ETag）**

- `Read` 返回 `readTokens[file]=token`
- `Write/Edit` 要求输入带 `base_read_token`（或 server 从 session 缓存校验）

#### `Write`

用途：写入整文件（create/update）。

输入：

```ts
type WriteInput = {
  file_path: string
  content: string
  base_read_token?: string // 强建议：更新已有文件必须提供
}
```

输出（data）：

```ts
type WriteOutput =
  | { kind: 'create'; filePath: string; bytes: number; structuredPatch?: any }
  | { kind: 'update'; filePath: string; bytes: number; structuredPatch: any }
```

语义：

- 权限：write（文件所在目录）
- 若文件已存在：
  - 必须存在匹配的 `readToken`，且 `currentToken === baseToken`
  - 否则拒绝：`stale_write`
- 写前：可自动 checkpoint（可配置）
- 写后：更新 token，触发 `events: file:edited`

#### `Edit` / `MultiEdit`

用途：按 patch/范围修改而非整文件写。

- 输入包含：`edits[]`（每个 edit 包含 search/replace 或 range）
- 输出包含：`structuredPatch` 供 UI 展示与审计

---

### 7.4 Notebook：`NotebookEdit`

语义类似 `Edit`，但操作 `.ipynb` 的 cell 结构；输出 cell diff。

---

### 7.5 Shell：`Bash` / `BashOutput` / `KillShell`

#### `Bash`

用途：执行 shell 命令（前台或后台）。

输入：

```ts
type BashInput = {
  command: string
  timeout_ms?: number
  run_in_background?: boolean
  // 安全开关：仅用户可通过 elicitation 开启
  dangerously_disable_sandbox?: boolean
}
```

输出：

```ts
type BashOutput =
  | {
      kind: 'completed'
      stdout: string
      stderr: string
      exitCode: number
      durationMs: number
    }
  | {
      kind: 'background'
      processId: string
      startedAt: number
      command: string
    }
```

关键语义：

- 权限：exec（基于“命令前缀/子命令前缀”规则）
- 建议实现：
  - **Bun.spawn** 执行（满足“bun 内置 shell 机制”）
  - 输出截断与大小限制
  - 前台执行可直接返回
  - 后台执行返回 `processId`，输出缓存到 session 的 process state
  - 同时用 `notifications/progress` 报告阶段（启动/运行/完成）

#### `BashOutput`

用途：读取后台进程增量输出（Claude Code-like “只返回新输出”）。

输入：

```ts
type BashOutputInput = {
  processId: string
  cursor?: { stdout: number; stderr: number } // 上次读取位置
}
```

输出：

```ts
type BashOutputOutput = {
  stdoutDelta: string
  stderrDelta: string
  nextCursor: { stdout: number; stderr: number }
  running: boolean
  exitCode?: number
  timedOut?: boolean
}
```

#### `KillShell`

用途：终止后台进程（同 session）。

输入：`{ processId: string }`
输出：`{ killed: boolean; exitCode?: number }`

---

### 7.6 Web（可选）：`WebFetch` / `WebSearch`

要求：

- 标注 `openWorldHint: true`
- 默认需要用户授权（网络访问）并记录审计事件
- 结果必须包含：
  - 原始 URL
  - 最终 URL（重定向）
  - 摘要与（可选）markdown
  - 截断策略与大小限制

---

### 7.7 用户交互：`AskUserQuestion` / `TodoWrite`

#### `AskUserQuestion`

两种实现策略：

1. 作为 tool：执行时触发 `elicitation/create(form)`，返回用户输入
2. 作为 prompts：返回一个“请用户回答”的模板，由 agent 自己问

为了 Claude Code-like：推荐实现为 tool + elicitation。

#### `TodoWrite`

写入一个 session/agent scoped 的 todo 列表（可持久化为资源，如 `unix://todo`），并触发 reminder 事件（给 agent 注入系统提醒）。

---

### 7.8 Plan Mode：`EnterPlanMode` / `ExitPlanMode`

#### `EnterPlanMode`

- 必须用户确认（elicitation）
- 输出 `planFilePath`（建议 `file:///.../plans/<slug>.md`）
- server 开启 planMode flag 并开始在后续 tool call 强制限制

#### `ExitPlanMode`

- 读取 plan file
- 触发用户审批（elicitation）
- 用户批准后：
  - 退出 planMode
  - （可选）设置 permissionMode（default/acceptEdits/bypassPermissions）
  - 返回 “approved plan” 与 plan 文本（供 agent 继续执行）

---

### 7.9 Checkpoint / 影子 Git（推荐内置）

工具族：

- `CheckpointCreate`
- `CheckpointList`
- `CheckpointDiff`
- `CheckpointRestore`
- `CheckpointDrop`

集成策略：

- 所有写操作（Write/Edit/MultiEdit/NotebookEdit）默认 `preflight` 自动 checkpoint（可配置）
- checkpoint 存储位置建议在 root 内：`.unix-coding-mcp/checkpoints/`
- Git repo：可用临时分支/commit；非 git：存 patch + 文件快照

---

## 8. 资源（Resources）设计：文件守护与“工具-文件关系”

### 8.1 资源 URI 约定

- 文件：`file:///abs/path/to/file`
- 目录：`file:///abs/path/to/dir/`
- 自定义资源（非文件）：`unix://session/state`、`unix://todo`、`unix://checkpoints`

### 8.2 订阅与更新

client 可订阅：

- 计划文件（plan file）
- 当前修改的文件
- todo 资源

server 使用 fs watch：

- 发现变化后对订阅 session 发送 `notifications/resources/updated`
- 可同时发 `notifications/message` 作为可见日志（可配）

---

## 9. 兼容性策略（对齐 Claude Code & 适配任意 agent）

### 9.1 “Claude Code-like”工具命名与行为

- 提供 Claude 命名别名：`Read/Write/Edit/Grep/Glob/Bash/...`
- 提供统一的 `structuredContent` 封装，包含 `newMessages/contextPatches`

### 9.2 “普通 MCP 客户端”兼容降级

如果客户端不支持：

- `elicitation`：用 tool error + 指引用户在聊天中确认 + 调 `permissions/grant`
- `resources/subscribe`：提供轮询工具 `FsPollChanges`（可选）
- `notifications/progress`：仍可通过 `BashOutput` 轮询输出
- `roots/list`：要求 client 在启动参数传 `--root`（stdio 模式可强制）

---

## 10. 配置与可观测性

### 10.1 配置来源优先级（建议）

1. CLI flags（本次运行）
2. workspace 配置：`<root>/.unix-coding-mcp.json`
3. user 配置：`~/.unix-coding-mcp.json`
4. 环境变量

### 10.2 日志与 trace

- `notifications/message` 输出结构化日志（level、logger、data）
- 建议额外提供资源：`unix://session/trace` 便于拉取最近 N 条事件

---

## 11. 与 Kode CLI 的对齐点（你关心的“0 用户感知改造”）

要做到“用户体验不变”，Kode CLI 需要：

- 继续用现有 Ink UI 展示 tool use/result
- 引入 `ExecutionBackend/Sandbox` 抽象：工具名与 UI 不变，但 `call()` 的执行迁移到 MCP（本地实现作为 fallback）
- 把“权限弹窗/plan 审批/AskUserQuestion”等交互统一承接为 **MCP `elicitation/create` handler**（避免双重弹窗）
- 升级 MCP client：声明并实现 `roots/list`、`resources/subscribe`、`notifications/resources/updated`、`notifications/progress`、`notifications/message`
- 把工具结果里的 `structuredContent(contextPatches/newMessages/reminders)` 做标准化解析并应用（模型选择、临时 allowed tools、plan mode reminders 等）

这样 Kode CLI 仍然是“Claude Code-like agent 主程序”，而 MCP 变成可复用的 unix 工具箱内核。

详细拆分评估见：`Claude_Code_Agent_Tool_System_final/22_kode_cli_mcp_split_assessment.md`。

---

## 12. 开放问题（建议在实现前定稿）

1. `command prefix` 风险检测是否允许调用 LLM？（网络受限时怎么办）
   - 建议：默认纯解析 + allowlist；可选开启 LLM 风险分析（需用户同意）。
2. plan file 的存储路径：是否严格对齐 `~/.claude/plans`？还是工具箱自带目录？
3. checkpoint 默认策略：每次写都 checkpoint 会不会太重？是否做“批量写一次 checkpoint”？
4. tool 命名：是否需要 `unix__` 前缀避免与其它 MCP server 冲突？
5. Slash/Skill：更通用的做法是 Prompts；但 Claude Code-like 是 tool 注入 `newMessages`。是否两者都做？
