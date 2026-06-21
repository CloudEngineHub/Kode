# Kode CLI × Claude Code CLI — 全量对齐审计（evidence-backed）+ 差异清单（DP-001+）+ 最小摩擦产品方案

> 审计目标：以 **Claude Code CLI 官方发布物**（本机当前证据锚点：`@anthropic-ai/claude-code@2.1.22` 的 `cli.js` 与官方 `CHANGELOG.md`）为最高优先级证据源，验证 Kode CLI 与其关键机制是否 **1:1 对齐**，并给出可落地修正路线图与回归策略。  
> 严谨性：所有 “Claude 官方行为” 结论都给出 **cli.js / CHANGELOG** 的可定位证据（搜索 needle + sha pinning；仅在版本一致时使用 `path:line`）。无法从静态证据证明的一律标注 **UNKNOWN** 并给出补证路径。

---

## 0) 审计输入（固定锚点）

### A. Claude Code（官方真实行为证据）

- `cli.js`（sha256: `da39b2c9fe9de2406e05b2f78451610416f2cba2ac624bc21d35d51a50c2d761`）
  - `<CLAUDE_CODE_PKG_ROOT>/cli.js`（版本/哈希锚点见 `docs/research/claude-code/01_inventory.md`）
- 官方变更记录
  - `<CLAUDE_CODE_ROOT>/CHANGELOG.md`

### B. Claude Code（社区逆向，仅作线索）

- `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main`

### C. 我方历史备忘（仅作线索）

- `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/cc_mem`

### D. Kode（审计对象）

- 当前仓库：`<KODE_REPO_ROOT>`
- 代码事实基线（Kode 侧证据索引）：`docs/research/kode/09_kode_baseline.md`
- Claude↔Kode 差异矩阵（D01–D40，双向证据）：`docs/research/10_delta_matrix.md`
- Claude 运行时机制证据规格：`docs/research/claude-code/07_runtime_specs.md`
- Claude UX 文案证据索引：`docs/research/claude-code/08_ux_stringbook.md`
- Esc + queued prompts 官方证据：`docs/research/claude-code/11_escape_queued_prompts_spec.md`

---

## 1) 对齐度评分（模块化）

> 评分口径：
>
> - **Aligned**：有官方静态证据 + Kode 代码证据，并且行为语义一致。
> - **Not aligned**：官方静态证据明确存在，但 Kode 机制缺失/不一致。
> - **UNKNOWN**：官方行为无法从 `cli.js/CHANGELOG` 静态证据确认，或 Kode 行为不透明；给出补证路径。

### 1.1 快速评分（当前结论）

- UI/交互：**中等（存在多处 Not aligned）**
  - 关键：官方 keybinding map（Esc/Shift+Tab/Ctrl+T/Ctrl+S/Ctrl+\_ / Meta+P / ? shortcuts）与 Kode 仍有差异（见 DP-041~DP-049）。
- 消息/上下文/恢复：**较高（P0 底座多项已对齐或已具备）**
  - 自动 compact + resume/continue + tool-result offload marker 与路径 allowlist 已具备（见 DP-013、DP-014、DP-020 等；以及 `docs/research/claude-code/09_compaction_resume_delta.md`）。
- 工具系统/并发：**中等（多项需要进一步证据/回归）**
  - Claude 的并发/队列/UI 语义部分可从 `cli.js` 证明；Kode 有 tool-use queue 与 queued progress 机制，但仍需覆盖更多边界（见 DP-013、DP-017、DP-050）。
- 权限/沙箱/安全：**较高（分发层已补齐）**
  - `<sandbox_violations>` 格式对齐（DP-014）；网络代理沙箱机制在 Kode 已具备。
  - Linux seccomp：Kode 已支持并在发布分发物中包含 `dist/vendor/seccomp/{x64,arm64}/{apply-seccomp,unix-block.bpf}`（DP-015 已 Resolved）。
- 插件/Skills/MCP/Hooks：**中等偏高**
  - Kode 有 hooks/plugin/skills/mcp 体系；但与 Claude 命令面/UX 面 1:1 对齐仍有差异（DP-041、DP-046）。

---

## 2) 覆盖矩阵（按必审计范围逐项给出结论）

> 每项都给出：状态（Aligned/Not aligned/UNKNOWN）→ 关联 DP → 官方证据 → Kode 证据/代码入口。

### 2.1 CLI 交互与 UI（3.1）

- 输入框：多行编辑（Shift+Enter） → **Aligned（Kode 实现）/ 官方部分 UNKNOWN**
  - Claude 证据：官方 keymap 明确存在 `enter:"chat:submit"`，但 Shift+Enter 语义未在 `cli.js` 明示（需动态验证）。
  - Kode 证据：`apps/cli/src/ui/hooks/useTextInput.ts:185`（Shift+Enter / Option+Enter 插入换行）+ `apps/cli/src/ui/components/TextInput.tsx:158`（CSI-u Shift+Enter 兼容）。
- 输入框：历史上下切换（Up/Down） → **Aligned（基本）**
  - Claude 证据：`cli.js`（search needles：`up:"history:previous"`、`down:"history:next"`）。
  - Kode 证据：`apps/cli/src/ui/hooks/useTextInput.ts:328`（up/down → history）。
- 输入框：未发送文本缓存（stash） → **Aligned（核心）**
  - Claude 证据：`cli.js`（search needles：`"ctrl+s":"chat:stash"`；shortcuts panel 文案 `double tap esc to clear input` 区块里包含 `ctrl+s … to stash prompt`）。
  - Kode 证据：`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:681`（`ctrl+s` stash/restore）。
- 快捷键：Shift+Tab 行为（mode cycle / auto-accept） → **Aligned（核心）**
  - Claude 证据：`cli.js`（search needles：`"shift+tab":"chat:cycleMode"`、`cycle between default mode, auto-accept edit mode, and plan mode`）。
  - Kode 证据：`apps/cli/src/ui/utils/permissionModeCycleShortcut.ts`（Shift+Tab / alt+m fallback）+ `packages/core/src/types/PermissionMode.ts`（cycle 顺序）+ `packages/core/src/test/unit/permission-mode-cycle.test.ts`。
- 快捷键：Esc 打断 + queued prompts 语义 → **Aligned（核心）**
  - Claude 证据：`<CLAUDE_CODE_ROOT>/CHANGELOG.md`（search needle：`Fixed Esc key with queued prompts to only move them to input without canceling the running task`；本机 2.1.12 文件中位于 `CHANGELOG.md:141`）。
  - Claude 证据：`cli.js`（search needles：`queuedCommands`、`popCommandFromQueue`；详见 `docs/research/claude-code/11_escape_queued_prompts_spec.md`）。
  - Kode 证据：`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:598`（Esc 将 queuedPrompts 合并回输入）。
- 快捷键：双 Esc 语义（clear input + rewind） → **Aligned（核心）**
  - Claude 证据：
    - shortcuts panel：`double tap esc to clear input`（`cli.js` search needle）
    - hint 文案：`Double-tap esc to rewind the conversation to a previous point in time`（`cli.js` search needle：`double-esc`）
  - Kode 证据：
    - 输入非空：double-press Esc 清空（`apps/cli/src/ui/components/PromptInput/PromptInput.tsx` + `apps/cli/src/ui/components/PromptInput/PromptInputView.tsx` pending microcopy）
    - 输入为空：double-press Esc 打开 message selector（rewind picker）（`apps/cli/src/ui/components/PromptInput/PromptInput.tsx` → `onShowMessageSelector()`）
    - 命令入口：`/rewind`（`apps/cli/src/commands/builtin/rewind.ts`）
- 等待/运行中状态：spinner/工具进度/错误态 → **Partially aligned / UNKNOWN**
  - Claude 证据：`cli.js` 存在 tool-use progress 渲染分支（需针对“等待/运行/失败”做更细的静态锚点提取）。
  - Kode 证据：`packages/core/src/engine/pipeline/tool-use-queue.ts:125`（queued “Waiting…”）与多个 UI tool presenter。
- 消息渲染：user/system/tool/subagent 区分 → **Partially aligned / UNKNOWN**
  - Claude 证据：`cli.js` 存在多类 message renderer（需专项抽取）。
  - Kode 证据：`apps/cli/src/ui/components/Message*` + tool presenters。
- status bar：内容/流转/自定义 → **Aligned（基础）**
  - Claude 证据：CHANGELOG 增加 `context_window.used_percentage` 与 `remaining_percentage`（`docs/research/reference/changelog.lines.md:9`）+ `cli.js` 包含 `used_percentage`/`remaining_percentage` 字段与计算逻辑（search needle：`used_percentage`）。
  - Kode 证据：`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:245`（同字段）+ `packages/core/src/services/statusline.ts:37`（可配置 statusLine command）。
- 主题系统/布局/弹窗/列表/菜单 → **UNKNOWN（需更细对照）**
  - Claude 证据：存在 `/theme`、多 overlay UI（见 DP-041）。
  - Kode 现状：已提供 `/theme` 命令面（`apps/cli/src/commands/builtin/theme.tsx`）。
- slash commands：完整列表与扩展机制 → **Partially aligned（命令名面已补齐）**
  - Claude 证据：`docs/research/claude-code/13_slash_commands_2.1.12.md`
  - Kode 证据：`apps/cli/src/commands/registry.ts` + `apps/cli/src/commands/builtin/parityStubs.ts`（DP-041）
- `/output-style`：风格控制一致性 → **Aligned（基础）/ 扩展面差异**
  - Claude 证据：CHANGELOG “Released output styles … /output-style”（`docs/research/reference/changelog.lines.md:821`）+ `cli.js` 存在 `output-style`。
  - Kode 证据：`apps/cli/src/commands/builtin/output-style.tsx` + outputStyles service。

### 2.2 模型通信协议与 messages 管理（3.2）

- message list 组织规则（system/tools/messages 顺序/注入点/截断点） → **Partially aligned / UNKNOWN**
  - Claude：需要从 `cli.js` 的消息构造/注入点做专项抽取（补证：定位 `systemPrompt` 构造与 message pipeline）。
  - Kode：`packages/core/src/engine/message-pipeline.ts`。
- system reminder / 周期性自动附加机制 → **Aligned（机制存在）**
  - Claude：存在 `<system-reminder>` tag 与相关系统提示（`cli.js` search needle：`<system-reminder>`；以及文案 “Tool results and user messages may include <system-reminder> tags.”）。
  - Kode：`packages/core/src/services/systemReminder/**` + `packages/core/src/engine/message-pipeline.ts:242` 注入。
- context window 满：压缩/offload/恢复策略 → **Aligned（核心）**
  - Claude：auto-compaction（`docs/research/reference/changelog.lines.md:1327`），tool-result offload marker（`cli.js` search needles：`<persisted-output>`、`Output too large`、`Full output saved to:`）。
  - Kode：autoCompact + persisted tool results（`packages/core/src/utils/autoCompactCore.ts`、`packages/core/src/utils/toolResultPersistence.ts`）。
- resume/continue：会话保存与恢复（含 compact boundary） → **Aligned（基础），仍需补回归**
  - Claude：`--continue/--resume`（`docs/research/reference/changelog.lines.md:1243`）+ compact boundary（`docs/research/reference/changelog.lines.md:501`）。
  - Kode：`packages/protocol/src/utils/kodeAgentSessionLoad.ts` + cli rootAction wiring（详见 `docs/research/claude-code/09_compaction_resume_delta.md`）。

### 2.3 工具系统与并发机制（3.3）

- tool 调用编排/并行/失败策略 → **Partially aligned / UNKNOWN**
  - Claude：可从 `cli.js` 的 `isConcurrencySafe`、queued tool progress、并发修复条目（`docs/research/reference/changelog.lines.md:125`）做专项抽取。
  - Kode：`packages/core/src/engine/pipeline/**` + unit tests（`packages/core/src/test/unit/tool-scheduler-concurrency.*`）。
- task/todo/ask user/plan 的 UI 组件与状态 → **Partially aligned**
  - Claude：todos/plan/status 等命令面存在（DP-041）。
  - Kode：`apps/cli/src/commands/builtin/work.tsx`（alias: `todos`/`tasklist`）、plan mode tooling、permission requests UI。
- 子代理（Task tool）：inherit 权限上下文/恢复 → **Aligned（设计约束满足），仍需更强回归**
  - Claude：CHANGELOG 有多处 subagents 相关修复（如 `docs/research/reference/changelog.lines.md:48`、`docs/research/reference/changelog.lines.md:171`）。
  - Kode：显式约束 “Subagents inherit parent toolPermissionContext”（见 repo `AGENTS.md`）+ `packages/core/src/test/unit/task-tool.test.ts`。
- fork context：skills/commands forked subagent → **UNKNOWN（需要专项对齐）**
  - Claude：CHANGELOG `context: fork`（`docs/research/reference/changelog.lines.md:84`）。
- Kode：存在 fork 概念（`forkNumber` 等），且 `context: fork` 已对齐（DP-052 Resolved）。

### 2.4 权限与安全（3.4）

- 沙箱：文件/网络限制 + 权限拦截 → **Aligned（核心），Linux seccomp 分发已对齐**
  - Claude：`<sandbox_violations>` side-channel（`cli.js` search needle：`<sandbox_violations>`）；network proxy infra；Linux seccomp（`cli.js` search needles：`vendor\",\"seccomp`、`apply-seccomp`）。
  - Kode：`packages/runtime/src/shell/sandboxViolations.ts` + sandboxNetworkInfrastructure + `packages/core/src/sandbox/linuxSeccomp.ts`；发布流程通过 `scripts/prepare-seccomp-assets.mjs` + `scripts/prepublish-check.js` + `scripts/smoke-packaged-install.sh` 强制确保 `dist/vendor/seccomp/**` 存在（DP-015）。
- 权限模式：auto edit / bypass / dontAsk / plan → **Aligned（名义）但 UX/模式入口差异**
  - Claude：`acceptEdits` / `bypassPermissions` / `dontAsk`（见 `docs/research/claude-code/08_ux_stringbook.md` 与 `cli.js` keymap）。
  - Kode：`packages/core/src/types/PermissionMode.ts` + permissions engine（DP-048）。
- 权限记忆与可审计/可撤销 → **Partially aligned**
  - Claude：CHANGELOG `/permissions`（`docs/research/reference/changelog.lines.md:845`、`docs/research/reference/changelog.lines.md:1155`）；规则来源解释等（`docs/research/reference/changelog.lines.md:44`）。
  - Kode：权限引擎 + `/permissions` 命令面（`apps/cli/src/commands/builtin/permissions.tsx`）。
- 安全守护（危险命令/最小权限/日志取证） → **Partially aligned**
  - Claude：CHANGELOG 多项 bypass 漏洞修复（`docs/research/reference/changelog.lines.md:11`、`docs/research/reference/changelog.lines.md:702`）。
  - Kode：有 gate + dump + tests，但需与 Claude 的具体绕过面逐项 fuzz 对照（DP-021、DP-050）。

### 2.5 插件/Skills/MCP/Hook 与脚本化调用（3.5）

- Skills：加载/权限/包结构/边界 → **Partially aligned**
  - Claude：CHANGELOG skills nested discovery + hot reload + fork（`docs/research/reference/changelog.lines.md:8`、`docs/research/reference/changelog.lines.md:83`、`docs/research/reference/changelog.lines.md:84`）。
- Kode：skills 体系存在（`apps/cli/src/commands/builtin/skills.tsx` + SkillTool）；hot reload + `context: fork` 已对齐（DP-052 Resolved）。
- MCP：发现/连接/权限/调用/恢复 → **Partially aligned**
  - Claude：CHANGELOG `/mcp` 一系列（`docs/research/reference/changelog.lines.md:922`、`docs/research/reference/changelog.lines.md:1119`、`docs/research/reference/changelog.lines.md:1345`、`docs/research/reference/changelog.lines.md:1354`）。
  - Kode：有 `mcp` 命令与 approval UI（仍需对齐命令子集与 UX）。
- Hooks：触发点/生命周期/与权限关系 → **Aligned（机制存在），细节需对齐**
  - Claude：hooks released（`docs/research/reference/changelog.lines.md:1026`）+ PreToolUse middleware `updatedInput`（`docs/research/reference/changelog.lines.md:96`）。
  - Kode：`packages/core/src/utils/kodeHooks.ts` + `packages/core/src/engine/pipeline/tool-call.ts:93` 支持 updatedInput 与 ask/allow 交互。
- 外部 script / SDK / 非交互流式 → **UNKNOWN（需要对照 Claude SDK 行为）**
  - Claude：CHANGELOG SDK session + additionalDirectories（`docs/research/reference/changelog.lines.md:814`、`docs/research/reference/changelog.lines.md:831`）。
  - Kode：print mode / input-format 等存在，但需对照 Claude 的具体 flags + JSON schema（DP-029、DP-030）。

### 2.6 工程质量与“去痕迹”（3.6）

- compat layer：legacy 名称收口 → **Partially aligned**
  - 目标：所有 legacy alias 集中在 compat 层（repo `AGENTS.md` 已规定）。
  - 现状：已存在 compat 目录与常量，但仍需 sweep 消除硬编码 `CLAUDE_*`（DP-040、DP-053）。

---

## 3) Diff Point List（DP-001…）— 结构化差异清单（含优先级与验收）

> 说明：本仓库已有一份 **“静态证据双向引用”的差异矩阵**（`docs/research/10_delta_matrix.md`，D01–D40）。  
> 但在当前工作区中，部分 Dxx 已经通过代码与测试完成对齐（见下方“已修复/已对齐”清单）。因此这里的 DP-001~DP-040 采用 **“Dxx → 当前状态”** 的方式呈现：
>
> - 仍未对齐：纳入 P0/P1/P2 路线图
> - 已对齐：标注为 Resolved（不再作为待修复差异）  
>   DP-041+ 为本次额外补齐的 UI/命令面/交互差异（不在 D01–D40 内）。

### DP-001 ~ DP-040（见 `docs/research/10_delta_matrix.md`）

- DP-001（D01）：数据根目录默认 `.claude` vs `.kode`
- DP-002（D02）：会话存储 roots 单根 vs 多根
- …
- DP-040（D40）：Sandbox 指示 env 兼容策略

对每个 DP 的详细字段（官方证据/代码证据/影响/修复建议/验收）在 `docs/research/10_delta_matrix.md` 中逐条给出（并保持 “可证据化” 的静态引用约束）。

#### 已修复 / 已对齐（当前代码已具备，建议把对应 Dxx 标注为 Resolved）

- D03/D04：debug log `debug/<sessionId>.txt` + `debug/latest` symlink（见 `packages/core/src/logging/transports.ts:40` 起）
- D06：errors 日志 `*.jsonl`（见 `packages/core/src/logging/log/paths.ts:55`）
- D07/D08：`cleanupPeriodDays` retention knob + 清理 plans/messages/errors/tool-results 等（见 `packages/core/src/utils/cleanup.ts:1` 起 + `packages/core/src/test/unit/cleanup-retention.test.ts:1`）
- D11：子代理转录路径 `<sessionId>/subagents/agent-*.jsonl`（见 `packages/protocol/src/utils/kodeAgentSessionLog.ts:105`）
- D12：tool-results 兼容布局 `projects/<project>/<sessionId>/tool-results` + `<persisted-output>`（见 `packages/core/src/utils/toolResultPersistence.ts:35`）
- D16：scratchpad allowlist（见 `packages/core/src/permissions/fileToolPermissionEngine/plan.ts:266`）
- D17：Read 工具 UI 语义（`Reading Plan` / `Read agent output`）（见 `packages/tools/src/tools/filesystem/FileReadTool/FileReadTool.tsx:114`）
- D18：async tool description 正确 await + cachedDescription（见 `packages/core/src/tooling/Tool.ts:234`、`packages/core/src/tooling/splitTool.ts:51`）
- D38：debug logs baseDir 走 dataRoot resolver（见 `packages/core/src/logging/transports.ts:20`）

> 重要提示：若你需要 **把 D01–D40 转成 DP-xxx 的完整模板化条目**（每条都含“差异类型/验收标准/测试策略”字段），建议直接基于 `docs/research/10_delta_matrix.md` 做一次脚本化生成（避免手工误差）。本审计先将 D01–D40 作为已验证差异底座，并把新增 UI/命令面差异在 DP-041+ 补齐。

### DP-041（UI/交互）— Built-in slash command 命令面不完整（与 Claude 不 1:1）

- 状态：**Partially resolved（命令名面已覆盖，功能面仍有缺口）**
- Claude 官方行为（证据）
  - `cli.js`（`@anthropic-ai/claude-code@2.1.12`）包含 60 个 built-in slash command 名称（仅包含 `[a-z0-9-]` 的 canonical names）
  - 证据：`docs/research/claude-code/13_slash_commands_2.1.12.md`
- Kode 当前行为（证据）
  - 内置命令注册：`apps/cli/src/commands/registry.ts`（含 `/rewind`、`/export`、`/files` 等对齐项）
  - 兼容 stub：`apps/cli/src/commands/builtin/parityStubs.ts`（补齐官方命令名面，默认隐藏，避免污染主 UX）
  - alias：`/feedback` → `/bug`（`apps/cli/src/commands/builtin/bug.tsx`），`/context` → `/ctx-viz`（`apps/cli/src/commands/debug/ctx_viz.ts`）
- 差异类型：功能不一致 / UX 摩擦（部分命令为 stub）
- 影响：迁移用户在 `/help` 中看到命令但遇到 “未支持” → 需要清晰区分 “兼容名面” 与 “已实现功能”
- 修复建议（最小风险）
  - 分层展示：在 “Claude profile / compatibility mode” 下显示 stub，默认 profile 下隐藏（但仍可手动输入）
  - 逐步用真实实现替换 stub：优先 `/keybindings`、`/sandbox`、`/stats`、`/usage`、`/install*`、`/remote-env`
- 优先级：P1
- 验收标准
  - **命令名面**：`getCommand()` 可解析官方 60 个 command names（见 `docs/research/claude-code/13_slash_commands_2.1.12.md`）
  - **功能面**：stub 集合逐步缩小，并在每次替换后加入回归测试（至少确保不会破坏 transcript import/replay）

### DP-042（UI/交互）— 官方 keybinding map 与 Kode 不一致（ctrl+t/ctrl+s/ctrl+\_/alt+p/? 等）

- 状态：**Resolved（核心键位已对齐）**
- Claude 官方行为（证据：`cli.js`）
  - keymap 片段（搜索 needle：`bindings:{escape:"chat:cancel"` / `ctrl+t":"app:toggleTodos"`）：
    - Global：`ctrl+t` todos，`ctrl+o` transcript，`ctrl+r` history search
    - Chat：`ctrl+s` stash，`ctrl+_` undo，`alt+p` model picker，`alt+t` thinking toggle，`ctrl+g` external editor
  - shortcuts panel：`double tap esc to clear input`、`shift+tab … to auto-accept edits`（`cli.js` search needle：`double tap esc to clear input`）
- Kode 当前行为（证据）
  - 全局 keybindings：`apps/cli/src/ui/screens/REPL/useReplController.tsx:552`（`ctrl+t` work tasks）、`apps/cli/src/ui/screens/REPL/useReplController.tsx:557`（`ctrl+o` transcript）、`apps/cli/src/ui/screens/REPL/useReplController.tsx:572`（`ctrl+r` history search）、`apps/cli/src/ui/screens/REPL/useReplController.tsx:577`（`alt+t` thinking toggle）、`apps/cli/src/ui/screens/REPL/useReplController.tsx:603`（`alt+p` model picker）、`apps/cli/src/ui/screens/REPL/useReplController.tsx:621`（`?` shortcuts/help）
  - 输入层：`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:1146`（`ctrl+s` stash）、`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:1185`（`ctrl+_` undo）、`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:503`（queued prompts）、`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:160`（double-Esc clear）
  - Key parser：`apps/cli/src/ui/contexts/KeypressContext.tsx:440`（`ctrl+_` 支持）
  - External editor：`apps/cli/src/ui/utils/promptInputSpecialKey.ts:30`（`ctrl+g`）
- 验收标准
  - 对齐 `cli.js` keymap（search needle：`bindings:{escape:"chat:cancel"`）：`ctrl+t/ctrl+o/ctrl+r/ctrl+s/ctrl+_/ctrl+g/alt+p/alt+t` 均可复现；`HistorySearch` 的 `Enter` 与 `historySearch:execute` 的“直接执行”语义一致（`apps/cli/src/ui/screens/overlays/HistorySearchScreen.tsx:14` + `apps/cli/src/ui/screens/REPL/useReplController.tsx:274`）

### DP-043（UI/交互）— `@` 补全语义不一致（Claude: file paths；Kode: agent）

- 状态：**Resolved（核心）**
- Claude 官方行为（证据：`cli.js` search needle：`@ for file paths`）
  - shortcuts panel 明示：`"@ for file paths"`
- Kode 当前行为（证据）
  - completion context 将 `@` 识别为 `file` 并保留 `@` 前缀：`apps/cli/src/utils/completion/context.ts:73`
  - `@` 场景下 file suggestions 优先：`apps/cli/src/utils/completion/generateSuggestions.ts:60`
  - 输入/预览/接受时保留 `@`：`apps/cli/src/ui/hooks/useUnifiedCompletion/useTabKey.ts:61`、`apps/cli/src/ui/hooks/useUnifiedCompletion/useNavigationKeys.ts:16`
- 差异类型：已修复
- 优先级：P0（已完成）
- 验收标准
  - 输入 `@REA`/`@src/` 可补全 repo 文件且补全后保留 `@`；agent 仍可通过 `@run-agent-...` 约定触发（见 `apps/cli/src/ui/hooks/useUnifiedCompletion/useAgentSuggestions.ts:75`）

### DP-044（UI/交互）— `? for shortcuts` 缺失（官方有专门 shortcuts panel）

- 状态：**Resolved（核心）**（已实现 Claude 风格 shortcuts overlay + `? for shortcuts` 默认提示）
- Claude 官方行为（证据：`cli.js`）
  - status bar hint：`"? for shortcuts"`
  - shortcuts panel 三列内容函数（needle：`function wV1` / `double tap esc to clear input` / `& for background`）
- Kode 当前行为（证据）
- `?`（输入为空时）打开 shortcuts overlay：`apps/cli/src/ui/screens/REPL/useReplController.tsx:472`
  - shortcuts overlay：`apps/cli/src/ui/screens/overlays/ShortcutsScreen.tsx:1`
  - 默认提示（无自定义 statusline 时）：`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:362`
- 差异类型：已修复
- 优先级：P1（已完成）
- 验收标准
  - `?` → shortcuts overlay；再次 `?` 或 `Esc` 关闭；内容与 `cli.js` shortcuts panel 列表一致（search needle：`double tap esc to clear input`，至少 core 行）

### DP-045（UI/交互）— Vim bindings（/vim）缺失

- Claude 官方行为（证据：`docs/research/reference/changelog.lines.md:1350`）
  - “Vim bindings for text input - enable with /vim or /config”
- Kode 当前行为（证据）
  - `/vim` 命令：`apps/cli/src/commands/builtin/vim.tsx:1`
  - config 面：`apps/cli/src/ui/screens/overlays/ConfigScreen.tsx:1`（Editor mode）
  - config schema：`packages/config/src/schema.ts:205`（`editorMode`）
  - 最小 Vim 输入层（NORMAL/INSERT + hjkl/0/$/w/b/x/i/a）：`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:136`
  - statusline 兼容字段：`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:339`（`vim.mode`）
- 差异类型：**Partially resolved**（已具备可用最小子集，但未覆盖 Claude 的完整 vim 操作符/对象/寄存器语义）
- 影响：从 “不可用” 降至 “可用但不完全一致”；对重度 Vim 用户仍可能有迁移摩擦
- 修复建议
  - 若要 1:1：补齐 `cli.js` 中 `rd2(...)` 的 operator/motion（needle：`function rd2` / `operatorTextObj` / `register`）并做 e2e keypress 回归
- 优先级：P2（除非目标用户以 Vim 为主）
- 验收标准
  - `/vim` 开启后，statusline 显示 vim mode，输入行为符合预期；可配置关闭

### DP-046（UI/命令面）— /theme、/terminal-setup、/status、/hooks、/permissions 等管理入口缺失或不一致

- Claude 官方行为（证据）
  - `cli.js` 内含 `userFacingName(){return"theme"|"terminal-setup"|"status"|"hooks"|"permissions"}`（DP-041 提取集）
  - CHANGELOG 提到 `/status`、`/permissions`、`/hooks` 多处（例如 `docs/research/reference/changelog.lines.md:1218`、`docs/research/reference/changelog.lines.md:845`、`docs/research/reference/changelog.lines.md:1026`）
- Kode 当前行为（证据）
- 已补齐 `/theme`：`apps/cli/src/commands/builtin/theme.tsx:1` + `apps/cli/src/ui/screens/overlays/ThemePickerScreen.tsx:1`
- 已补齐 `/terminal-setup`：`apps/cli/src/commands/builtin/terminal-setup.tsx:1` + `apps/cli/src/ui/screens/overlays/TerminalSetupScreen.tsx:1`
- 已补齐 `/status`：`apps/cli/src/commands/builtin/status.tsx:1` + `apps/cli/src/ui/screens/overlays/StatusScreen.tsx:1`
- 已补齐 `/hooks`：`apps/cli/src/commands/builtin/hooks.tsx:1` + `apps/cli/src/ui/screens/overlays/HooksScreen.tsx:1`
- 已补齐 `/permissions`：`apps/cli/src/commands/builtin/permissions.tsx:1` + `apps/cli/src/ui/screens/overlays/PermissionsScreen.tsx:1`
- 已补齐 `/add-dir`（Claude 有该命令用于添加 working directory）：`apps/cli/src/commands/builtin/add-dir.tsx:1`
- 差异类型：Resolved（入口层已对齐；仍需对齐各屏幕的字段/文案细节）
- 影响：权限/ hooks / statusline / 主题等核心可控性入口缺失 → 降低信任
- 修复建议
  - 继续对齐屏幕级细节：字段/来源解释/禁用策略（policySettings）、以及与非 Anthropic provider 的降级行为
- 优先级：P1（UI 细节对齐）
- 验收标准
  - CLI 交互路径与 Claude 对齐：在无需打开 config 文件的情况下可完成查看/修改/验证

### DP-047（协议/恢复）— `@` 生态命名空间与 suggestions（~/.claude/\* 参与补全）未对齐

- 状态：**Resolved（已补齐 root suggestions）**
- Claude 官方行为（证据）
  - CHANGELOG 记录：`@-mention: Add ~/.claude/* files to suggestions for easier agent, output style, and slash command editing`
  - 证据：`<CLAUDE_CODE_ROOT>/CHANGELOG.md`（search needle：`Add ~/.claude/* files to suggestions`；本机 2.1.12 文件中位于 `CHANGELOG.md:851`）
- Kode 当前行为（证据）
  - `@` file path completion 额外注入 `.kode/`、`.claude/`、`~/.kode/`、`~/.claude/` root suggestions：`apps/cli/src/utils/completion/generateSuggestions.ts`（`generateSpecialFileRootSuggestions`）
- 差异类型：已对齐（兼容名面 + Kode-first）
- 优先级：—
- 验收标准
  - 输入 `@` / `@.` / `@~` 时，补全列表中出现 `.kode/` 与 `~/.kode/`；存在 legacy `.claude/` 时也出现（只读发现，不默认写入）

### DP-048（权限/交互）— permission mode cycle 具体语义未证明 1:1（Dp2 vs getNextPermissionMode）

- 状态：**Resolved（Shift+Tab cycle 与官方一致）**
- Claude 官方行为（证据）
  - `cli.js` hint 文案明确：`Hit ... shift+tab ... to cycle between default mode, auto-accept edit mode, and plan mode`
  - 证据：`<CLAUDE_CODE_PKG_ROOT>/cli.js`（search needle：`cycle between default mode, auto-accept edit mode, and plan mode`）
- Kode 当前行为（证据）
  - `packages/core/src/types/PermissionMode.ts`：default → acceptEdits → plan → default（bypass/dontAsk 不再进入 Shift+Tab cycle）
  - 单测：`packages/core/src/test/unit/permission-mode-cycle.test.ts`
- 差异类型：已对齐（同时降低误触 bypass 风险）
- 优先级：—
- 验收标准
  - Shift+Tab 循环 3 态：default → acceptEdits → plan → default；并保持进入 plan 时记录 `lastPlanModeUse`

### DP-049（交互）— background `&` 模式缺失（官方快捷入口）

- Claude 官方行为（证据：`cli.js` search needle：`& for background`）
  - shortcuts panel：`"& for background"`
- Claude 官方行为（证据：`cli.js` needles）
  - background prompt tags：`<background-task-input>` / `<background-task-output>`（needle：`tengu_input_background`）
- Kode 当前行为（证据）
  - `&` prompt mode：`apps/cli/src/ui/components/PromptInput/types.ts:7` + `apps/cli/src/ui/components/PromptInput/PromptInput.tsx:52`
  - 执行路径：`apps/cli/src/ui/utils/processUserInput.tsx:25`（映射到 BashTool `run_in_background`）
  - UI 前缀：`apps/cli/src/ui/components/PromptInput/PromptInputView.tsx:166`
  - transcript tags：`<background-task-input>` / `<background-task-output>`（`apps/cli/src/ui/utils/processUserInput.tsx:48`）
- 差异类型：已修复
- 影响：长任务背景化路径与 Claude 不一致
- 修复建议
  - Claude profile：支持 `&` 前缀将 prompt 作为 background task（输出落盘并产生 `<task-notification>`）
- 优先级：P1
- 验收标准
  - `& <cmd>` 可后台执行；完成后产生通知 marker；/tasks 可查看

### DP-050（安全/权限）— Bash/权限绕过面需要对 Claude CHANGELOG 的漏洞条目逐项回归

- 状态：**Partially resolved（已把最高风险条目落到回归 + 修复）**
- Claude 官方行为（证据：CHANGELOG，使用 search needles 定位）
  - `Fixed permission bypass via shell line continuation that could allow blocked commands to execute`
  - `Fixed security vulnerability where wildcard permission rules could match compound commands containing shell operators`
  - `Fixed security vulnerability where Bash tool permission checks could be bypassed using prefix matching`
- Kode 当前行为（证据：实现 + 回归）
  - compound command 不再允许 “full-command wildcard allow” 覆盖未授权子命令：`packages/core/src/permissions/bash/engine.ts:192`
  - `&`/`|&` 作为分隔符拆分子命令，且 `&>`/`&>>` 被识别为重定向而非分隔符：
    - `packages/core/src/permissions/bash/shellTokens.ts:8`
    - `packages/core/src/permissions/bash/redirections.ts:121`
  - sandbox auto-allow 路径也按子命令应用 deny/ask（避免 compound bypass）：`packages/core/src/permissions/bash/engine.ts:294`
  - 回归测试（Claude security anchors → tests）：
    - line continuation bypass：`packages/core/src/test/unit/bash-permission-engine.test.ts:191`
    - wildcard + compound operators（`&&`/`&`/`|&`）：`packages/core/src/test/unit/bash-permission-engine.test.ts:87`
    - prefix matching “无空格误匹配” 防绕过：`packages/core/src/test/unit/bash-permission-engine.test.ts:61`
    - `splitCommand` 对 `&>`/`|&` 的拆分语义：`packages/core/src/test/unit/split-command.test.ts:9`
- 差异类型：安全风险（已对齐关键面，仍需继续覆盖）/ P0
- 影响：避免 allowlist/wildcard 在 compound/shell-operator 场景下产生越权执行
- 下一步（仍需补齐）
  - 将 CHANGELOG 中所有“Fixed security vulnerability …”条目逐条映射到最小可复现用例，并补齐单测/属性测试（尤其是 heredoc、subshell、process substitution、weird redirections）
- 验收标准
  - 对应 CHANGELOG 的每个安全漏洞条目，在 Kode test suite 里都有 **可复现用例**（旧行为）与 **修复回归**（新行为）

### DP-051（UI/恢复）— Read 工具语义标签仍需细分（Reading Plan / Read agent output）

- 状态：Resolved（已对齐）
- Claude 官方行为（证据）
  - Read Plan / Read agent output（见 `docs/research/10_delta_matrix.md` D17 的 Claude 侧证据锚点）
- Kode 当前行为（证据）
  - `packages/tools/src/tools/filesystem/FileReadTool/FileReadTool.tsx:114`
- 差异类型：已对齐（不再是差异点）
- 优先级：—
- 验收标准：已满足（有对应单测：`packages/core/src/test/unit/file-read-tool-userfacing-name.test.ts:1`）

### DP-052（Skills/Slash Commands）— `context: fork` + `agent` 已对齐；hot reload 已对齐

- 状态：Resolved（已对齐）
- Claude 官方行为（证据）
  - CHANGELOG：`context: fork` + `agent`（`docs/research/reference/changelog.lines.md:84`、`docs/research/reference/changelog.lines.md:85`）
  - `cli.js`：fork runner 选择 agent + 注入允许工具（needle：`async function ID1`，约 `cli.js:2601`）
  - `cli.js`：SkillTool 分支 `W.context==="fork"` → `Tt5(...)` → 返回 `{status:"forked",agentId,result}`（needle：`function Tt5`，约 `cli.js:2722`）
- Kode 当前行为（证据）
  - hot reload（Aligned）：
    - watcher + debounce：`apps/cli/src/services/customCommands/watcher.ts`（`startCustomCommandWatcher`）
    - reload：`apps/cli/src/services/customCommands/reload.ts`（`reloadCustomCommandsForSession`）
    - UI refresh：`apps/cli/src/ui/screens/REPL/useReplController.tsx`
    - 单测：`apps/cli/src/services/customCommands/hotReload.test.ts`
  - frontmatter 支持：skills / commands / plugin skills/commands 支持 `context: fork` + `agent`
    - `apps/cli/src/services/customCommands/types.ts`
    - `apps/cli/src/services/customCommands/discovery.ts`
    - `apps/cli/src/services/customCommands/pluginLoader.ts`
  - 执行语义：
    - SkillTool：`packages/tools/src/tools/interaction/SkillTool/SkillTool.tsx`
    - SlashCommandTool：`packages/tools/src/tools/interaction/SlashCommandTool/SlashCommandTool.tsx`
    - TaskTool（force fork 上下文开关）：`packages/tools/src/tools/ai/TaskTool/call.ts` + `packages/core/src/tooling/Tool.ts`
  - 单测：
    - skill fork：`packages/core/src/test/unit/skill-tool-forked-context.test.ts`
    - slash command fork：`packages/core/src/test/unit/slash-command-forked-context.test.ts`
    - skill loader frontmatter：`apps/cli/src/services/customCommands/skillLoader.test.ts`
- 差异类型：已修复
- 优先级：—
- 验收标准
  - skills：在 `SKILL.md` frontmatter 设 `context: fork`（可选 `agent: <type>`），触发 fork 子代理执行并返回 `{status:"forked",agentId,result}`
  - slash commands：在 `./.kode/commands/*.md` frontmatter 设 `context: fork`（可选 `agent: <type>`），触发 fork 子代理执行并返回 `{status:"forked",agentId,result}`
  - 允许工具：frontmatter `allowed-tools` 在 fork run 内进入同一 permission engine（command allow rules），并通过单测验证

### DP-053（工程质量/去痕迹）— legacy compat 命名/硬编码需要进一步收口

- Claude 官方行为：使用 `CLAUDE_*` env / `.claude` 为 canonical
- Kode 产品约束：`AGENTS.md` 规定 Kode-first，legacy alias 集中 compat 层
- 差异类型：代码卫生 / 维护性风险
- 优先级：P2
- 验收标准
  - legacy alias 全部通过 compat 常量引用；产品 narrative 不出现 Claude-first 命名

---

### DP-054（权限/安全 / Linux）— Linux sandbox 网络代理桥（socat bridges）缺失导致“sandbox=断网”（高摩擦）

- 状态：**Resolved（网络代理桥 + Linux seccomp 分发已对齐；见 DP-015）**
- Claude 官方行为（证据：`cli.js` search needles）
  - Linux 依赖检查：`which`, `bwrap`, `socat`
  - host 侧 bridge：`Starting HTTP bridge: socat` / `Starting SOCKS bridge: socat` / `Linux bridges ready`
  - sandbox 内 proxy bridge：`socat TCP-LISTEN:3128` / `socat TCP-LISTEN:1080` + `--unshare-net` + `--setenv HTTP_PROXY=http://localhost:3128` / `ALL_PROXY=socks5h://localhost:1080` -（本机 2.1.12 也包含 seccomp fallback 文案：`Seccomp filtering not available` / `apply-seccomp` / `unix-block.bpf`）
- Kode 当前行为（证据）
  - host 侧桥：`packages/core/src/sandbox/sandboxNetworkInfrastructure/linuxBridge.ts`（spawn `socat UNIX-LISTEN → TCP:localhost:<hostPort>`）
  - infra 统一入口：`packages/core/src/sandbox/sandboxNetworkInfrastructure.ts`（Linux 时创建 `linuxBridge` 并在 cleanup 时 kill）
  - tool 注入：`packages/tools/src/tools/system/BashTool/sandboxNetwork.ts`（Linux：注入 `linuxBridge`，并固定 `httpProxyPort=3128`、`socksProxyPort=1080`）
  - runtime bwrap wrapper：`packages/runtime/src/shell/linuxSandbox.ts`（Linux：`--unshare-net` + `--setenv` proxy vars + 启动 `socat TCP-LISTEN → UNIX-CONNECT`）
  - sandbox 可用性：`packages/core/src/sandbox/bunShellSandboxPlan.ts`（Linux：要求同时存在 `bwrap` + `socat`，与官方依赖一致）
- 差异类型：缺失 → 已对齐（Linux sandbox 不再默认“断网”）
- 影响
  - 之前：Linux sandbox enabled 时 `--unshare-net` 直接导致大量常用命令（git/npm/curl）不可用 → 高摩擦
  - 之后：网络通过 host proxy infra + policy/ask gate 受控放行；保持“默认安全 + 可解释”
- 优先级：P0（安全 + 可用性）
- 验收标准（可复现步骤）
  - Linux 环境：安装 `bwrap` + `socat`，开启 sandbox（settings）
  - 运行：`!curl https://example.com`（或 git fetch/npm install）
    - 未允许域名：经代理返回 403（deny/ask）
    - 允许域名：成功
    - 直接网络绕过：失败（仍在 net namespace 内）

## 4) Claude Code 值得抄的机制（Best Mechanisms to Copy）

> 只提取 **可证据化** 的机制；每条给出：为什么好 → Kode 是否已有 → 最小风险复制路径

- BM-01：统一 keymap registry + context-aware bindings（Global/Chat/Autocomplete/…）
  - 证据：`cli.js`（search needles：`bindings:{escape:"chat:cancel"`；以及 keymap resolver `resolve`/`Chat`/`Global` action labels）
  - 价值：可发现/可自定义/一致性强（减少 UI 分叉）
  - Kode：目前 keypress 分散在多处（REPL/PromptInput/TextInput/Overlays）
  - 路径：引入 “keymap profile + binding context” 中枢，保持 Ink 层 hook 仅消费动作
- BM-02：`<sandbox_violations>` stderr side-channel + UI strip
  - 证据：`cli.js`（search needle：`<sandbox_violations>`）
  - 价值：安全失败可解释性强，且不会污染模型/用户视图
  - Kode：已实现（DP-014）
  - 路径：补齐 macOS/Linux 违规捕获一致性与更强 tests
- BM-03：tool-result offload（`<persisted-output>` + `tool-results/` + preview）
  - 证据：`cli.js`（search needles：`<persisted-output>`、`Output too large`、`Full output saved to:`、`Preview (first`）
  - 价值：上下文稳态 + 可追溯 + 不爆 context window
  - Kode：已实现（`packages/core/src/utils/toolResultPersistence.ts`）
  - 路径：补 import/replay 兼容与 UI 跳转（Read tool label）
- BM-04：status line 输入结构化 + 预计算 context window 百分比
  - 证据：`docs/research/reference/changelog.lines.md:9` + `cli.js` search needle `used_percentage`
  - 价值：用户可自定义 statusline 且不需要重新实现 token 统计
  - Kode：已对齐字段（`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:245`）
- BM-05：Hooks middleware（PreToolUse `updatedInput` + ask）
  - 证据：`docs/research/reference/changelog.lines.md:96` + `docs/research/claude-code/08_ux_stringbook.md`（hook reason 文案）
  - 价值：把复杂策略“外置化”为可组合 middleware，同时仍保持用户同意
  - Kode：已实现 updatedInput + allow/ask 模式（`packages/core/src/engine/pipeline/tool-call.ts:93`）

---

## 5) Kode “最小摩擦”产品设计蓝图（用户心智优先）

> 本节为产品层设计（不要求官方证据）。已在仓库蓝图中固化：`docs/product/11_post_human_blueprint.md`。这里给出与本审计的对齐关系与最小可行落地策略。

### 5.1 Jobs-to-be-done（用户真正要做什么）

- 快速完成项目内任务：读/改/跑/查/提交/回滚
- 长任务不中断：后台跑、可追溯、失败可复盘
- 低打扰安全：默认安全、少问但可解释、可撤销
- 可恢复：崩溃/重启/切机器也能继续（resume/continue）
- 可脚本化：CI/管道/非交互场景稳定产出

### 5.2 最小摩擦默认体验（Default that “just works”）

- 默认路径短：`kode <prompt>` → 自动选择工具 → 输出可用 artifacts
- 复杂路径渐进披露：需要时才出现 `/permissions`、`/hooks`、`/statusline`
- 失败即证据：每次失败都有可点击路径（logs/tool-results/tasks output）

### 5.3 “对话管理系统”（自举 / meta）

- 用 agent CLI 管 agent CLI：`/capabilities` 作为唯一推荐自检入口（无硬菜单）
- 把设置修改做成可回滚事务：权限规则、hook、skills 安装/启停都可撤销

### 5.4 何处必须 1:1 对齐，何处允许扩展

- 必须 1:1（P0）
  - keybindings profile（DP-042）、slash command 面（DP-041）、权限/沙箱语义（DP-014/015/050）、offload/compaction/resume（DP-013/20）
- 允许扩展（P2）
  - extra tools（D31–D37）、市场/skills 生态（只要不破坏 compat surfaces）

---

## 6) 升级后 “100% 可用” 回归策略（Regression Plan）

### 6.1 回归测试清单（建议作为 gating）

- 交互（TUI）
  - keymap：Esc/Shift+Tab/Ctrl+T/Ctrl+S/Ctrl+\_/Meta+P/Ctrl+O/?（Claude profile）
  - queued prompts：Esc 仅回填输入，不取消 running task（见 CHANGELOG spec）
  - completion：`/` anywhere、`@` file paths（Claude profile）
- 权限/安全
  - dontAsk auto-deny 文案与行为
  - bypassPermissions gate（org policy vs settings 的提示文案）
  - Bash 绕过用例回归（对应 Claude CHANGELOG security anchors）
- 存储/恢复
  - tool-results 超大输出 offload + Read allowlist
  - auto-compact 不丢 pending prompt
  - resume/continue 基于 compact boundary 截断
- 并发/任务
  - tool-use queue：queued “Waiting…” → running 替换，tool_use_id 稳定
  - background tasks：输出落盘 + `<task-notification>` marker
- MCP/Hooks/Skills
  - hooks：PreToolUse updatedInput + ask
  - MCP orphan process 清理、mcp list/get 稳定
  - skills：hot reload、fork context（若实现）

### 6.2 兼容性策略（Kode-first + legacy compat）

- Canonical write surface：`.kode/**`；legacy `.claude/**` 只读发现 + 显式导入
- legacy aliases 全部集中 compat 层：env/header/目录名/label 统一出口
- 提供导入/迁移报告：导入了什么、没导入什么、为何

### 6.3 性能与稳定性指标（建议 SLO）

- 启动：TUI 可交互时间
- 响应：首 token 时间 / tool execution 进度可见性
- UI：无输入卡顿/光标错位/ghost line（特别是 paste/IME/小终端）
- 恢复：崩溃后 `--continue` 成功率；resume 的 compact boundary 正确率
- 取证：每个失败都有 logs/tool-results/tasks output 路径
