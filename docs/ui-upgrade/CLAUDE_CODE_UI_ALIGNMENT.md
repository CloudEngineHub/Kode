# Kode CLI ↔ Claude Code（官方 cli.js）终端 UI 行为对齐：证据与差异清单

目标：把 Kode 的终端交互“心智与摩擦”对齐 Claude Code 的最佳实践，同时遵守本仓库的产品偏好（默认不 wipe scrollback、不强制全屏）。

> 本文件只写“可被代码证据支持的事实”和“明确标注的对齐任务”，避免任何推测。

---

## 1) Claude Code 的可观测 UI/终端行为（证据）

### 1.1 外部编辑器 / 子进程接管终端：pause Ink + suspend stdin + 临时 alt screen

- 证据：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2890`
  - `if(!B)throw Error("Ink instance not found - cannot pause rendering");`
  - `if(B.pause(),B.suspendStdin(),Z)process.stdout.write("\x1B[?1049h... \x1B[2J\x1B[H");`
  - `finally{if(Z)process.stdout.write("\x1B[?1049l...");B.resumeStdin(),B.resume()}`

### 1.2 MCP server 审批对话框结束后：清 viewport + 清 scrollback（CSI 3J）

- 证据：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4945`
  - `process.stdout.write("\x1B[2J\x1B[3J\x1B[H",()=>{B()})`

### 1.3 编辑模式：提供 `vim` 命令在 Vim/Normal 间切换，并提示 Escape 行为

- 证据：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:3986`
  - `mK7={name:"vim",description:"Toggle between Vim and Normal editing modes",...}`
  - `value:\`Editor mode set to ${B}. ${B==="vim"?"Use Escape key to toggle between INSERT and NORMAL modes.":"Using standard (readline) keyboard bindings."}\``

### 1.4 长输出的“展开”提示：`ctrl+o`

- 证据：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1661`
  - `x2A.default.createElement(F0,{shortcut:"ctrl+o",action:"expand",parens:!0})`
- 证据：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1671`
  - `"... (" + <bold>"ctrl+o"</bold> + " to see all)"`

### 1.5 轻量通知系统（toast / inbox）：统一的 `addNotification` / `removeNotification`

- 证据：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2151`
  - `Q.addNotification?.({key:"error-compacting-conversation",text:"Error compacting conversation",priority:"immediate",color:"error"})`
- 证据：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:3406`
  - `function x6(){ ... return {addNotification:G,removeNotification:Z} }`
  - `P({key:"escape-again-to-clear",text:"Esc to clear again",priority:"immediate",timeoutMs:1000})`

**可吸收结论（基于证据）**

- Claude Code 把“瞬时提示/错误/引导”做成了统一 toast API（`addNotification/removeNotification`），并以 `priority/timeoutMs/invalidates` 控制展示队列（同上引用）。

### 1.6 文件索引：优先 `git ls-files`，失败再 fallback 到 ripgrep（更快/更一致）

- 证据：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1985`
  - `k(\"[FileIndex] getProjectFiles called, respectGitignore=${Q}\")`
  - `k(\"[FileIndex] using git ls-files result ...\")`
  - `k(\"[FileIndex] git ls-files returned null, falling back to ripgrep\")`

---

## 2) Kode 当前行为（证据）

### 2.1 清屏：默认仅清 viewport，不清 scrollback

- 证据：`apps/cli/src/utils/terminal.ts:52-77`
  - `clearTerminal()` 默认走 `clearViewport()`（`terminal.ts:52-54`）
  - `clearViewport()` 写入 `\x1b[2J\x1b[H`，并在注释中明确避免 `CSI 3J`（`terminal.ts:56-66`）
  - `clearScrollback()` 仅在显式调用时写入 `\x1b[2J\x1b[3J\x1b[H`（`terminal.ts:69-77`）

### 2.2 MCP server 审批对话框：临时 alternate screen（默认仅清 viewport，不 wipe scrollback）

- 证据：`apps/cli/src/entrypoints/cli/mcpServerApproval.tsx:21-53`
  - MCP 审批在 `withEphemeralAlternateScreen(async () => { ... })` 中渲染（`mcpServerApproval.tsx:21-53`）
- 证据：`apps/cli/src/utils/terminal.ts:153-170`
  - `withEphemeralAlternateScreen()` 默认 `enterAlternateScreen()`，并在进入后调用 `clearTerminal()`（即 `clearViewport()`；`terminal.ts:162-169`）
  - 退出时 `exitAlternateScreen()`，回到进入前的 shell 画面与 scrollback（`terminal.ts:168-170`）

### 2.3 外部编辑器：pause Ink + suspend stdin + 临时 alt screen（对齐 Claude Code）

- 证据：`apps/cli/src/ui/utils/inkInstanceStore.ts`
  - `setInkInstanceForStdout(stdout, instance)` / `getInkInstanceForStdout(stdout)`（stdout → Ink instance 映射）
- 证据：`apps/cli/src/entrypoints/cli/interactive/renderers.tsx`
  - `setInkInstanceForStdout(stdout, instance)`（在 REPL/Resume/LogList/Doctor render 时注册 instance）
- 证据：`apps/cli/src/utils/externalEditor.ts`
  - `instance?.pause?.()` / `instance?.suspendStdin?.()`
  - `terminalCapabilityManager.disableAllModes()` → `terminalCapabilityManager.enableSupportedModes()`
  - `return await withEphemeralAlternateScreen(fn)`
  - `spawn(..., { stdio: 'inherit' })`
  - `instance?.resumeStdin?.()` / `instance?.resume?.()`

### 2.4 长输出展开：`ctrl+o`（对齐 Claude Code 的心智）

- 证据：`apps/cli/src/ui/screens/REPL/useReplController.tsx:105-120`
  - `if (key.ctrl && inputChar === 'o') { setVerbose(prev => !prev) }`
- 证据：`apps/cli/src/ui/toolPresenters/TaskOutputToolPresenter.tsx:65-116`
  - 非 verbose 时显示 `Read output (ctrl+o to expand)`，verbose 时渲染实际内容。

### 2.5 “stdio guard 的可观测性”：提供 `/console` 查看被捕获的 stdout/stderr

- 证据：`apps/cli/src/utils/stdio.ts:8-15`
  - 保存原始 `stdout/stderr.write` 并暴露到 `globalThis.__KODE_ORIGINAL_*`
- 证据：`apps/cli/src/utils/stdio.ts:169-195`
  - monkey patch `process.stdout.write`/`process.stderr.write` 只记录、不实际写入（防止破坏 Ink）
- 证据：`apps/cli/src/commands/builtin/console.tsx:5-18`
  - 新增 `/console`（local-jsx, fullscreen）
- 证据：`apps/cli/src/ui/components/TuiConsoleDialog.tsx:18-53`
  - 展示前对控制字符做转义（避免真正执行 escape sequences）

### 2.6 轻量通知系统（toast + inbox）：对齐 Claude Code 的 `addNotification/removeNotification`

- 证据：`packages/core/src/services/notificationCenter.ts:47`
  - `addNotification(...)` / `removeNotification(...)` / `clearNotifications(...)`
- 证据：`packages/core/src/services/notifier.ts:42`
  - `sendNotification()` 在非 `notifications_disabled` 时将通知写入通知中心（同时发送 iTerm2 OSC/bell）。
- 证据：`packages/core/src/engine/message-pipeline.ts:110`
  - 后台 bash 通知同时写入通知中心（`addNotification`：`message-pipeline.ts:121`）。
- 证据：`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:121`
  - 订阅通知中心并展示 toast（`timeout=6000ms`）。
- 证据：`apps/cli/src/ui/components/PromptInput/PromptInputView.tsx:208`
  - toast 复用 status line 的既有行高（不新增布局行数）。
- 证据：`apps/cli/src/ui/components/TuiNotificationsDialog.tsx:57`
  - inbox UI：滚动/保存/打开/清空。
- 证据：`apps/cli/src/commands/builtin/notifications.tsx:5`
  - 新增 `/notifications`（alias: `/notifs`）。
- 证据：`apps/cli/src/ui/screens/REPL/useReplController.tsx:158`
  - `F5` 打开通知中心（仅在无模态时触发）。

### 2.7 文件索引：优先 `git ls-files`，失败 fallback 到 `rg --files`

- 证据：`apps/cli/src/ui/components/OpenFileDialog.tsx:28`
  - `indexProjectFiles()` 先尝试 `git ls-files -co --exclude-standard`（`OpenFileDialog.tsx:135-140`），失败 fallback 到 `rg --files`（`OpenFileDialog.tsx:145-146`）。
- 证据：`apps/cli/src/ui/components/OpenFileDialog.tsx:149`
  - 简易缓存（最多 5 个 cwd）+ `Ctrl+R` 触发强制重建索引（`OpenFileDialog.tsx:287-300`）。

---

## 3) 差异点与对齐任务（明确可执行）

### 3.1 外部编辑器/子进程接管：对齐 Claude Code 的“安全暂停/恢复”流程

**差异证据**

- Claude Code：pause Ink + suspend stdin + 可选 alt screen（`cli.js:2890`）。
- Kode：已实现同等流程（见 2.3 引用）。

**对齐状态（已完成）**

1. `withSuspendedInk()`：`apps/cli/src/utils/externalEditor.ts`（pause/resume + suspend/resume stdin）。
2. Ink instance 发现：`apps/cli/src/ui/utils/inkInstanceStore.ts` + `apps/cli/src/entrypoints/cli/interactive/renderers.tsx`。
3. 临时 alt screen：`apps/cli/src/utils/terminal.ts` 的 `withEphemeralAlternateScreen()`。

### 3.2 MCP 审批结束清屏策略：默认不 wipe scrollback，但提供可选“强清场”

**差异证据**

- Claude Code 在 MCP 审批结束调用 `\x1B[2J\x1B[3J\x1B[H`（`cli.js:4945`）。
- Kode 只做 viewport 清理（`mcpServerApproval.tsx:20-24` + `terminal.ts:52-66`）。

**对齐任务**

1. 将 Kode 的清屏能力拆分为：
   - `clearViewport()`（默认）
   - `clearScrollback()`（显式、仅当用户配置/安全策略要求时使用）
2. MCP 审批结束动作改为策略化：
   - 默认：`clearViewport()` 或“无需清屏，直接回到 REPL”；
   - 可配置：对齐 Claude Code 的 `clearScrollback()`。
3. 验收：用户配置为默认时，shell history 可回看；配置为强清场时行为可控且一致。

**当前进展（已落地 / 待串联）**

- 已落地：`apps/cli/src/utils/terminal.ts` 提供 `clearViewport()` 与 `clearScrollback()`（默认仍不 wipe）。
- 已落地：`wipeScrollbackOnClear` 全局配置（`packages/config/src/schema.ts`）+ `/config` UI 开关（`apps/cli/src/ui/components/Config.tsx`）+ `/clear` 使用该策略（`apps/cli/src/commands/builtin/clear.ts`）。
- 待串联：把 MCP 审批结束动作按策略选择是否 `clearScrollback()`（当前默认只清 viewport，且对话框已在临时 alternate screen 内渲染）。

### 3.3 Vim/Normal 编辑模式（可选增强）

**差异证据**

- Claude Code 提供 `vim` 命令切换编辑模式（`cli.js:3986`）。

**对齐任务（可选，按产品定位决定）**

1. 在 Kode 的 PromptInput/TextInput 层增加可选 Vim mode（独立于 UI 渲染层）。
2. 提供一致的提示与快捷键发现（对齐 Claude Code 文案/行为）。

### 3.4 Toast/通知中心：对齐 Claude Code 的 “add/remove notification” 心智

**差异证据**

- Claude Code：统一 toast API（`cli.js:3406`）并用于 “Esc to clear again” 等即时提示（`cli.js:3406`）。
- Kode：已实现进程内通知中心 + toast + inbox（见 2.6 引用）。

**对齐状态（已完成）**

1. `addNotification/removeNotification/clearNotifications`：`packages/core/src/services/notificationCenter.ts`。
2. toast 展示：`apps/cli/src/ui/components/PromptInput/PromptInput.tsx` + `PromptInputView.tsx`。
3. inbox：`/notifications` + `TuiNotificationsDialog` + `F5`。

### 3.5 文件索引：对齐 “git ls-files → ripgrep fallback”

**差异证据**

- Claude Code：`git ls-files` 失败才 fallback ripgrep（`cli.js:1985`）。
- Kode：`/open` 采用相同策略（见 2.7 引用）。

**对齐状态（已完成）**

1. `OpenFileDialog`：先 `git ls-files -co --exclude-standard`，失败再 `rg --files`。
2. 缓存与刷新：避免每次打开都全量扫描；提供 `Ctrl+R` 强制刷新。
