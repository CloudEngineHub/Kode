# Kode CLI Terminal UI Upgrade — Master Plan (ui-upgrade worktree)

> Kode CLI — Design for post-human workflows.  
> One unit agent for every human & computer task.

本文件同时包含：

1. **严格证据**（来自 Gemini CLI / OpenCode / Toad / Claude Code 官方混淆 CLI）
2. **Kode 当前实现审计**（基于本 worktree 代码）
3. **产品蓝图 + 100% 升级计划**（分阶段、可验收、可回滚）

---

## 0. 术语与目标（来自需求本身）

### 0.1 目标

- **极致终端交互体验**：一致性（各平台/各常用终端）、性能、渲染稳定、交互密度、可发现性、可恢复性。
- **“在 shell 中继续交互”心智**：启动交互界面不应破坏已有 shell 输出历史（不 wipe scrollback、不强制全屏/clear），除非明确提供显著优势且可选。
- **深度对标并吸收**：Gemini CLI、Toad(Textual)、OpenCode(@opentui/solid)、Claude Code（官方混淆 cli.js）。

### 0.2 非目标（为了可控交付）

- 不在本轮把 Ink 替换成全新 TUI 引擎（例如 OpenTUI/Textual），而是在 **Ink 体系内**做到稳定、跨终端一致，并为未来替换/并存留出接口。

---

## 1. 证据库（No Guessing：每条结论都给出原文/原码线索）

> 说明：以下证据引用使用“文件路径:行号”的方式；引用片段为原文裁剪，不做语义补全。

### 1.1 Claude Code（官方混淆 cli.js）— 屏幕与 stdin 管理策略

#### 1.1.1 外部编辑器：暂停 Ink 渲染 + suspend stdin + 临时进入 alternate screen

- 证据：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2890`
  - 关键片段（原文裁剪）：
    - `if(!B)throw Error("Ink instance not found - cannot pause rendering");`
    - `if(B.pause(),B.suspendStdin(),Z)process.stdout.write("\x1B[?1049h... \x1B[2J\x1B[H");`
    - `finally{if(Z)process.stdout.write("\x1B[?1049l...");B.resumeStdin(),B.resume()}`

**可吸收结论（基于证据）**

- Claude Code 将“外部编辑器”视作一次 **临时脱离 Ink 的控制域**：先 pause Ink、suspend stdin，再必要时进入 `DECSET 1049` alternate screen 并清屏，最后恢复（同上引用）。

#### 1.1.2 MCP server 审批：显式清屏并清 scrollback（CSI 3J）

- 证据：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4945`
  - 关键片段（原文裁剪）：`process.stdout.write("\x1B[2J\x1B[3J\x1B[H",()=>{B()})`

**可吸收结论（基于证据）**

- Claude Code 在特定“安全/权限/MCP”相关对话框结束时，选择 **wipe scrollback**（`CSI 3J`），属于“强清场”策略（同上引用）。
- 这与本需求“尽量不 clear/不 wipe shell history”的偏好可能冲突，因此需要在 Kode 中将其做成 **可选/可配置**（见第 3/4 节计划）。

---

### 1.2 Gemini CLI — 高性能 Ink 架构与抗闪烁策略

#### 1.2.1 alternate buffer gating + mouse 事件只在 alternate buffer 开启

- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/gemini-cli/packages/cli/src/gemini.tsx:187-276`
  - `const useAlternateBuffer = shouldEnterAlternateScreen(...);`
  - `const mouseEventsEnabled = useAlternateBuffer;`
  - `if (mouseEventsEnabled) { enableMouseEvents(); ... disableMouseEvents(); }`
  - `render(..., { ... alternateBuffer: useAlternateBuffer, incrementalRendering: ... && useAlternateBuffer })`

**可吸收结论（基于证据）**

- Gemini 将 alternate buffer 作为“增强交互/渲染模式”的开关，并把鼠标事件绑定在该模式下（避免默认模式污染输入流）。

#### 1.2.2 “动态内容必须 fit viewport”：测量 footer 高度、计算可用高度，必要时 refresh Static

- 证据：`gemini-cli`（commit `b0bc7c3d9`）`packages/cli/src/ui/App.tsx:392-420`
  - `measureElement(mainControlsRef.current)` → `setFooterHeight(...)`
  - `availableTerminalHeight = terminalHeight - footerHeight - staticExtraHeight`
  - `if (pendingItemDimensions.height > availableTerminalHeight) { setStaticNeedsRefresh(true); }`
  - 注释明确提到 “Ink core bug ... PR out to fix: https://github.com/vadimdemedes/ink/pull/717”

**可吸收结论（基于证据）**

- Gemini 的抗闪烁核心策略之一是：**测量 + 约束动态区域高度**，一旦超出就触发一次 Static 刷新，避免 Ink “动态擦除区域不断增长/撕裂”（同上引用注释与逻辑）。

#### 1.2.3 相关 commit 线索（用于进一步深挖）

以下是 Gemini `packages/cli/src/ui` 的 commit 消息证据（来自 `git log` 过滤输出）：

- `b0bc7c3d9 Fix flicker issues by ensuring all actively changing content fits in the viewport (#1217)`
- `4fc9b1cde alternate buffer support (#12471)`
- `4d85ce40b Turns out the node console.clear() clears the buffer. (#12959)`
- `5e218a563 Turn off alternate buffer mode by default. (#13623)`
- `da85aed5a Add one to the padding in settings dialog to avoid flicker. (#15173)`
  （证据来源：`git -C .../gemini-cli log --oneline -- packages/cli/src/ui | rg ...` 的输出结果）

#### 1.2.4 `console.clear()` 会清 scrollback（buffer），需要显式规避

- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/gemini-cli`（commit `4d85ce40b`）`packages/cli/src/ui/AppContainer.tsx:734-746`
  - `if (!isAlternateBuffer) { console.clear(); }`

**可吸收结论（基于证据）**

- `console.clear()` 会产生“清 buffer/scrollback”副作用，因此需要在 UI 中对“清屏”做策略化（viewport vs scrollback），并避免在不该清 scrollback 的场景直接调用 `console.clear()`。

#### 1.2.5 SettingsDialog：padding +1 用于避免贴底闪烁

- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/gemini-cli`（commit `da85aed5a`）`packages/cli/src/ui/components/SettingsDialog.tsx:449-456`
  - `const DIALOG_PADDING = 5;`（从 4 调整为 5）

**可吸收结论（基于证据）**

- 在 Ink/TTY 组合里，“贴底渲染”极易触发滚屏/闪烁；通过额外 padding/safe margin 留出最后一行空白是有效的抗闪烁手段。

#### 1.2.6 stdio 防护：patch stdout/stderr + Ink 使用“真实写入”代理

- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/gemini-cli/packages/core/src/utils/stdio.ts:9-78`
  - 在 patch 之前 capture 原始 `process.stdout.write` / `process.stderr.write`（`stdio.ts:9-11`）
  - `patchStdio()` monkey patch `process.stdout.write` / `process.stderr.write`，并将输出转发到 `coreEvents.emitOutput(...)`（`stdio.ts:36-72`）
  - cleanup 会恢复原始 write（`stdio.ts:74-77`）
- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/gemini-cli/packages/core/src/utils/stdio.ts:80-113`
  - `createWorkingStdio()` 为 stdout/stderr 创建 Proxy，强制 `write` 走 `writeToStdout` / `writeToStderr`（`stdio.ts:85-113`）
- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/gemini-cli/packages/cli/src/gemini.tsx:215-276`
  - `const { stdout: inkStdout, stderr: inkStderr } = createWorkingStdio();`（`gemini.tsx:215`）
  - `render(..., { stdout: inkStdout, stderr: inkStderr, ... })`（`gemini.tsx:251-276`）
- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/gemini-cli/packages/cli/src/gemini.tsx:293-300`
  - `const cleanupStdio = patchStdio();` + `cleanupStdio();`（`gemini.tsx:295-300`）

**可吸收结论（基于证据）**

- Gemini 通过 `patchStdio()` 把“任何 stray stdout/stderr 输出”变成“事件流”，避免破坏 Ink 的动态区域（见 `stdio.ts:31-78`）。
- 同时用 `createWorkingStdio()` 给 Ink 提供“绕过 patch 的真实写入”，保证 UI 输出仍然可靠（见 `stdio.ts:80-113` + `gemini.tsx:215-276`）。

---

### 1.3 OpenCode — 高频渲染/通知系统/状态栏范式

#### 1.3.1 60 FPS renderer + ToastProvider + Kitty keyboard + stdout 拦截策略

- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/opencode/packages/opencode/src/cli/cmd/tui/app.tsx:118-179`
  - `targetFps: 60`（`app.tsx:165-168`）
  - `useKittyKeyboard: {}`（`app.tsx:169-170`）
  - `ToastProvider`（Provider 树中，`app.tsx:127-158`）
- 证据：同文件 `app.tsx:183-188`
  - `renderer.disableStdoutInterception()`（避免 stdout 被拦截导致 UI 污染/抖动）

#### 1.3.2 底部 footer：目录 + 权限 + LSP + MCP 状态一体化

- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/opencode/packages/opencode/src/cli/cmd/tui/routes/session/footer.tsx:49-87`
  - 显示 `directory()`
  - 显示 Permission 数量、LSP 数量、MCP 状态、`/status` 提示

#### 1.3.3 git log 限制（无法做“历史 UI 演进”分析）

- 证据：`git -C /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/opencode log --oneline --max-count=5` 仅有一个 grafted commit（v1.1.11）。

---

### 1.4 Toad（Textual）— 侧栏/PTY Pane/文件树过滤

#### 1.4.1 Sidebar：Collapsible panels + focus trap + overflow scroll

- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/toad-main/src/toad/widgets/side_bar.py:10-79`
  - `BINDINGS = [("escape", "dismiss", ...)]`
  - `DEFAULT_CSS` 包含 `overflow: hidden scroll;`
  - `on_mount(): self.trap_focus()`
  - `widgets.Collapsible(...)` 组合 panels

#### 1.4.2 CommandPane：PTY + resize 传播 + 环境标准化

- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/toad-main/src/toad/widgets/command_pane.py:57-73`（resize → `TIOCSWINSZ`）
- 证据：同文件 `command_pane.py:97-149`（`pty.openpty()`、`TERM=xterm-256color`、异步读写）

#### 1.4.3 ProjectDirectoryTree：基于 `.gitignore` 的过滤

- 证据：`/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/toad-main/src/toad/widgets/project_directory_tree.py:24-74`
  - `PathSpec.from_lines(GitWildMatchPattern, ...)`
  - `filter_paths()` 中 `path_spec.match_file(path)`

#### 1.4.4 git log 限制

- 证据：`toad-main` 目录非 git repo（`git log` 报错 “not a git repository”）。

---

## 2. Kode 当前实现（ui-upgrade worktree）— 实际代码审计

### 2.1 “不 wipe scrollback”的清屏策略（已调整）

- 证据：`apps/cli/src/utils/terminal.ts:52-66`
  - `clearTerminal()` 使用 `'\x1b[2J\x1b[H'`，并在注释中明确 “Avoid CSI 3J (clear scrollback)”

### 2.2 REPL：测量 footer + 动态区 fit viewport（与 Gemini 同源思想）

- 证据：`apps/cli/src/ui/screens/REPL/REPLView.tsx:108-167`
  - `useLayoutEffect` 测量 `mainControlsRef` 与 `messageSelectorRef` 的高度
  - `availableHeight = rows - mainControlsHeight - messageSelectorHeight - VIEWPORT_SAFE_MARGIN_ROWS`
- 证据：`apps/cli/src/ui/screens/REPL/REPLView.tsx:169-188`
  - 超出时 `out.write(CLEAR_VIEWPORT)`（当前是 `\x1b[2J\x1b[H`）并 remount Static

### 2.3 会话/日志列表：避免“贴底渲染导致终端滚屏闪烁”（已调整）

- 证据：`apps/cli/src/ui/components/SessionSelector.tsx:21-32`
  - `safeMarginRows = 1`，并把 `visibleOptionCount` 限制为 `rows - headerRows - footerRows - safeMarginRows`
- 证据：`apps/cli/src/ui/components/LogSelector.tsx:23-30`
  - 同样的 safe margin 逻辑（避免 `height="100%"` 贴底）

### 2.4 Select 行渲染：强制 truncate，避免隐式换行造成高度抖动（已调整）

- 证据：`apps/cli/src/ui/components/CustomSelect/select-option.tsx:77-81`
  - label Text 增加 `wrap="truncate-end"`

### 2.5 `ctrl+o`：长输出展开/折叠（对齐 Claude Code 心智）

- 证据：`apps/cli/src/ui/screens/REPL/useReplController.tsx:105-165`
  - `ctrl+o` 切换 `verbose`（`useReplController.tsx:116-120`）
- 证据：`apps/cli/src/ui/toolPresenters/TaskOutputToolPresenter.tsx:59-116`
  - 非 verbose 时提示 `Read output (ctrl+o to expand)`；verbose 时渲染实际输出。

### 2.6 `/console`：可视化 stdio-guard 捕获的 stdout/stderr（debug/取证）

- 证据：`apps/cli/src/utils/stdio.ts:169-195`
  - TUI 期间 monkey patch `process.stdout.write`/`process.stderr.write`，将“杂散输出”转为内存捕获（避免破坏 Ink）
- 证据：`apps/cli/src/commands/builtin/console.tsx:5-18`
  - 新增 `/console`（local-jsx, fullscreen）
- 证据：`apps/cli/src/ui/components/TuiConsoleDialog.tsx:18-53`
  - 显示前对控制字符做转义（避免真正执行 escape sequences）

### 2.7 全局快捷入口（吸收 Gemini/OpenCode 的“可发现性”）

- 证据：`apps/cli/src/ui/screens/REPL/useReplController.tsx:105-165`
  - `F1` Help，`F2` Config，`F3` Open file，`F4` Console，`F5` Notifications（仅在无模态时触发）

### 2.8 Toast / 通知中心（对齐 Claude Code 的 `addNotification/removeNotification` 心智）

- 证据：`packages/core/src/services/notificationCenter.ts:1`
  - `addNotification(...)` / `removeNotification(...)` / `clearNotifications(...)`
- 证据：`packages/core/src/services/notifier.ts:42`
  - `sendNotification()` 在非 `notifications_disabled` 时写入通知中心（同时发送 iTerm2 OSC/bell）。
- 证据：`packages/core/src/engine/message-pipeline.ts:110`
  - 后台 bash 完成通知会进入通知中心（`addNotification(...)`：`message-pipeline.ts:121`），同时仍注入给模型的 `<bash-notification>` 兼容消息。
- 证据：`apps/cli/src/ui/components/PromptInput/PromptInput.tsx:121`
  - 订阅通知中心并把最新通知以 toast 形式展示（超时自动隐藏）。
- 证据：`apps/cli/src/ui/components/PromptInput/PromptInputView.tsx:208`
  - `toastMessage.show` 在 status line 中渲染（不新增行高，避免抖动）。
- 证据：`apps/cli/src/commands/builtin/notifications.tsx:5`
  - 新增 `/notifications`（fullscreen inbox）。
- 证据：`apps/cli/src/ui/components/TuiNotificationsDialog.tsx:57`
  - 通知中心 UI：滚动/保存/打开/清空。

---

## 3. 产品蓝图（Blueprint）— “Inline as default, Power as opt-in”

> 本节为“设计提案”，不声称现有代码已实现。

### 3.1 两种 UI 运行模式（并存且可切换）

#### A) Inline Mode（默认）

- 不进入 alternate buffer（不改变用户 shell 心智）。
- 不 wipe scrollback；**仅在极少数修复撕裂场景清 viewport**（且应可配置是否清）。
- 交互体验对齐 Claude Code 的“在 shell 中继续交互”：历史在终端 scrollback 内自然累积，底部输入框始终可用。

#### B) Focus Mode（可选/高级）

- 进入 alternate screen（`DECSET 1049`），提供：
  - App 内滚动/搜索/多面板（侧栏、任务、文件树、MCP/LSP 状态等）。
  - 更激进的渲染节流/增量更新策略。
- 参考证据：
  - Gemini：alternate buffer gating 与 incrementalRendering（`gemini.tsx:187-276`）。
  - OpenCode：60fps + Toast + footer 状态（`opencode app.tsx:118-179`, `footer.tsx:49-87`）。

### 3.2 布局信息架构（IA）

- 顶部：轻量 Header（项目、分支/目录、当前模型/模式、成本/令牌）。
- 中部：对话/任务流（流式输出时强约束高度，永不“顶到最后一行”）。
- 底部：输入框 + 状态行（快捷键提示、权限状态、后台任务提示）。
- 可弹出：Command Palette / Settings / MCP 管理 / 文件树 / 通知中心（Toast + Inbox）。

---

## 4. “100% 升级”实施计划（分阶段、每阶段都有验收标准）

### Phase 0 — 基线与度量（1–2 天）

**目标**：先确保任何改动都可观测、可回归。

- 增强 flicker/overflow 监测：在 Ink 渲染高度超过终端高度时记录事件（现有基础见 `apps/cli/src/ui/hooks/useFlickerDetector.ts:5-31`）。
- 增加“终端能力探测”日志开关：输出检测到的 kitty/modifyOtherKeys/bracketedPaste/terminalName（现有检测见 `apps/cli/src/ui/utils/terminalCapabilityManager.ts:55-204`）。
- 验收：可在 debug 日志中定位到“哪一帧高度超标/为何超标”。

### Phase 1 — 渲染稳定性（本轮优先，立刻提升体验）

**目标**：彻底消灭“贴底渲染导致的滚屏闪烁”；启动与列表滚动体验稳定。

- 全局 UI 组件库约束：禁止 `height="100%"` 这类贴底布局；统一采用 “safe margin rows” 规则（已在 Session/Log selector 落地，见 `SessionSelector.tsx:21-32`, `LogSelector.tsx:23-30`）。
- 所有选择列表项强制 `wrap="truncate-end"`，避免隐式换行导致行高变化（已在 `select-option.tsx:77-81` 落地）。
- 统一清屏 API：区分
  - `clearViewport()`（不 wipe scrollback）
  - `clearScrollback()`（显式、仅在用户选择或特定安全场景）
  - 并禁止直接使用未经审计的清屏 helper（避免意外发送 `CSI 3J`）。Claude Code 在某些场景会使用 `CSI 3J`，见 `cli.js:4945`。
- 验收：
  - SessionSelector/LogSelector 上下滚动无终端滚屏闪烁（macOS Terminal/iTerm2/WezTerm/Windows Terminal）。
  - 进入 REPL 时不 wipe scrollback；终端可向上滚动回看。

### Phase 2 — “外部编辑器 / 子进程占用终端”的一致性（对齐 Claude Code）

**目标**：任何 `stdio: inherit` 的子进程（编辑器/工具）都不会破坏 UI；退出后 UI 恢复一致。

- 参考 Claude Code：pause Ink + suspend stdin + 临时 alternate screen（证据 `cli.js:2890`）。
- 在 Kode 实现同等策略（Ink instance 的 pause/resume + stdin suspend），并把它封装为 `withSuspendedInk(fn)`。
- 验收：打开外部编辑器（vim/nano/code -w/notepad）前后，UI 不撕裂、不残留乱码、不丢输入焦点。

### Phase 3 — 跨终端兼容矩阵（系统性补齐）

**目标**：在“常见组合”上获得一致键盘/粘贴/光标/宽字符行为。

- 终端能力与输入协议：
  - kitty keyboard protocol / modifyOtherKeys / bracketed paste（Kode 已有探测+启用：`terminalCapabilityManager.ts:55-204`、`terminal.ts:71-93`）。
  - 针对不同终端差异建立黑/白名单与 fallback。
- 验收矩阵（至少）：
  - macOS: Terminal.app, iTerm2, WezTerm, Kitty
  - Linux: GNOME Terminal, WezTerm, Kitty, tmux
  - Windows: Windows Terminal + PowerShell, WSL Ubuntu + Windows Terminal

### Phase 4 — UI 功能栈（把“极致体验”做成模块化能力）

**目标**：吸收 OpenCode/Toad/Gemini 的交互范式，形成 Kode 的“post-human UX”。

- Toast/通知中心（参考 OpenCode `ToastProvider` 与复制提示：`opencode app.tsx:127-159`, `app.tsx:199-212`）。
- 底部状态栏：权限/MCP/LSP/任务（参考 OpenCode footer：`footer.tsx:49-87`）。
- 侧栏系统：可折叠 panels + focus trap（参考 Toad：`side_bar.py:10-79`）。
- 文件树：`.gitignore` 过滤（参考 Toad：`project_directory_tree.py:24-74`）。
- 文件系统交互（Quick Open）：输入过滤 + 列表选择 + 直接进入外部编辑器（见本 worktree `/open` 实现：`apps/cli/src/ui/components/OpenFileDialog.tsx` + `apps/cli/src/commands/builtin/open.tsx`）。
- 内嵌 command pane（长任务/PTY 输出）：resize 传播（参考 Toad：`command_pane.py:57-73`）。
- 验收：功能为可选模块，不影响 Inline Mode 的极简体验。

### Phase 5 — 性能与回归治理（长期防线）

**目标**：任何 UI 回归可被快速定位与阻止。

- 增加“渲染帧耗时/频率”指标（Gemini 有 onRender slow render 记录：`gemini.tsx:265-270`）。
- 关键路径压测：超长会话、超长输出、窄窗口、多工具并发输出。
- 验收：引入阈值告警与基准对比（`bun test`/`bun run typecheck` 必须通过）。

---

## 5. 本 worktree 已落地的改动（可立即验证）

### 5.1 终端 scrollback 保护

- `apps/cli/src/utils/terminal.ts:52-77`：`clearTerminal()` 默认仅清 viewport（`CSI 2J` + `CSI H`），`clearScrollback()` 才会发送 `CSI 3J`。

### 5.2 列表滚动闪烁缓解

- `apps/cli/src/ui/components/SessionSelector.tsx:21-32`：safe margin + 去掉贴底布局。
- `apps/cli/src/ui/components/LogSelector.tsx:23-30`：同上。
- `apps/cli/src/ui/components/CustomSelect/select-option.tsx:77-81`：`wrap="truncate-end"` 避免隐式换行。

### 5.3 REPL 动态区更保守的 viewport 约束

- `apps/cli/src/ui/screens/REPL/REPLView.tsx:26`：加入 `VIEWPORT_SAFE_MARGIN_ROWS`（常量）。
- `apps/cli/src/ui/screens/REPL/REPLView.tsx:246-252`：约束 transient 区域可用高度时扣除 safe margin，减少“超一行导致终端滚屏”风险。

### 5.4 外部编辑器：pause Ink + suspend stdin + 临时 alt screen（对齐 Claude Code）

- `apps/cli/src/ui/utils/inkInstanceStore.ts`：stdout → Ink instance 映射（供外部编辑器暂停/恢复）。
- `apps/cli/src/entrypoints/cli/interactive/renderers.tsx`：注册 Ink instance。
- `apps/cli/src/utils/externalEditor.ts`：`withSuspendedInk()` 封装 pause/resume、suspend/resume stdin、禁用/恢复键盘协议、并用 `withEphemeralAlternateScreen()` 包裹 `stdio: inherit` 子进程。

### 5.5 文件系统交互：`/open`（Quick Open → 外部编辑器）

- `apps/cli/src/commands/builtin/open.tsx`：新增内置命令 `/open`（fullscreen）。
- `apps/cli/src/ui/components/OpenFileDialog.tsx`：优先 `git ls-files -co --exclude-standard`，失败 fallback 到 `rg --files`；带缓存与 `Ctrl+R` 刷新（证据见 `OpenFileDialog.tsx:28-147`, `OpenFileDialog.tsx:149-170`, `OpenFileDialog.tsx:287-300`）。
- `packages/core/src/utils/ripgrep.ts`：新增 `ensureRipgrepReady()`（为 UI 层 spawn ripgrep 提供“已准备好/已 codesign”路径）。

### 5.6 防止 stray stdout/stderr 破坏 Ink 渲染（Gemini-style）

- `apps/cli/src/utils/stdio.ts:8-178`：capture 原始 stdout/stderr write；patch 时记录并落盘；Ink 使用 `createInkStdio()` 代理绕过 patch。
- `apps/cli/src/ui/utils/inkRender.ts:19-38`：所有 Ink `render()` 入口统一注入 `ensureTuiStdioPatched()` 返回的 working stdio，并注册 Ink instance（供外部编辑器暂停/恢复）。
- `apps/cli/src/app.tsx:20-25` + `apps/cli/src/app.tsx:217-225`：退出时 `restoreTuiStdioPatch()` 并用真实 write 恢复光标（避免 patch 吞掉控制序列）。

### 5.7 通知中心：toast + inbox（Claude Code/OpenCode 风格）

- `packages/core/src/services/notificationCenter.ts:1`：进程内通知中心（队列 + subscribe）。
- `apps/cli/src/ui/components/PromptInput/PromptInput.tsx:121`：toast 展示逻辑（不占额外行数）。
- `apps/cli/src/ui/components/TuiNotificationsDialog.tsx:57`：inbox UI（滚动/保存/打开/清空）。
- `apps/cli/src/ui/screens/REPL/useReplController.tsx:158`：`F5` 打开通知中心。

### 5.8 Doctor：终端能力与渲染策略自检

- `apps/cli/src/ui/screens/Doctor.tsx:22`：输出 TERM/终端名/kitty 协议/modifyOtherKeys/bracketed paste、alt screen 策略与 scrollback 策略。
- `apps/cli/src/ui/utils/terminalCapabilityManager.ts:223`：补齐 supported/enabled 的 getter，便于 Doctor 展示。

---

## 6. 下一步执行顺序（从“稳定性”到“极致体验”）

1. Phase 1 完整铺开（全 UI 组件统一 safe margin + truncate 策略，彻底消灭贴底滚屏闪烁）
2. Phase 2 对齐 Claude Code 外部编辑器/子进程策略（pause Ink / suspend stdin / alt buffer）
3. Phase 3 建立跨终端矩阵与兼容层（输入协议、paste、宽字符、tmux）
4. Phase 4 模块化引入 Toast/Status/Sidebar/FileTree/CommandPane（以 Focus Mode 为主）
5. Phase 5 性能/回归体系化（渲染帧指标 + 压测用例）
