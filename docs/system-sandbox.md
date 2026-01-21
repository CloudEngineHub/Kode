# Sandbox（系统级隔离执行）— 现状、实现与跨平台策略

本仓库已经具备“应用层权限控制”（tool permission、plan/acceptEdits 模式、读写路径 allowlist、危险命令 guard）能力；同时也已经具备“系统级隔离执行”的第一层落地：在 **macOS / Linux** 上用 OS 机制包裹 Bash 执行（filesystem + network 约束），并将网络访问收敛到“可审计、可提示、可记忆”的代理通道。

本文件用于解释：当前实现的真实行为、代码入口、依赖项与后续缺口（例如 Linux seccomp）。

## 1) 当前实现概览（真实代码入口）

### 1.1 进程执行与 sandbox wrapper

- 统一执行引擎：`packages/runtime/src/shell/exec.ts`
- sandbox 命令构造：`packages/runtime/src/shell/sandboxCommand.ts`
  - Linux：bubblewrap（`bwrap`）+ namespaces（`--unshare-net` 等）
  - macOS：`sandbox-exec` + 动态 profile（`packages/runtime/src/shell/macosSandbox.ts`）
- Linux bwrap 具体 mount/args：`packages/runtime/src/shell/linuxSandbox.ts`
- macOS profile + `<sandbox_violations>` tag：
  - profile：`packages/runtime/src/shell/macosSandbox.ts`
  - violations tag 写入/剥离：`packages/runtime/src/shell/sandboxViolations.ts`

### 1.2 两条“启用 sandbox”的路径（System vs Settings）

- **System sandbox（环境变量 / safe-mode）**：`packages/core/src/sandbox/systemSandbox.ts`
  - 入口：`packages/tools/src/tools/system/BashTool/call.ts`（`decideSystemSandboxForBashTool`）
  - 特点：主要用于 agent_call 的“额外保护层”；是否允许继承网络由 `KODE_SYSTEM_SANDBOX_NETWORK=inherit|none` 控制。
- **Settings sandbox（.kode/.claude settings）**：`packages/core/src/sandbox/bunShellSandboxPlan.ts`
  - 入口：`packages/tools/src/tools/system/BashTool/call.ts`（`getBunShellSandboxPlan`）
  - 特点：面向“日常使用”的可配置 sandbox（enabled/excludedCommands/allowUnsandboxedCommands/autoAllowBashIfSandboxed 等）。

## 2) Linux（bubblewrap）行为细节

### 2.1 Filesystem 隔离（bwrap mount view）

- 写入限制开启时：`--ro-bind / /` 作为只读根视图，然后对 allowWrite roots 逐个 `--bind <path> <path>` 覆盖为可写
- 读禁区（denyRead）：目录用 `--tmpfs <dir>`，文件用 `--ro-bind /dev/null <file>`
- 实现：`packages/runtime/src/shell/linuxSandbox.ts`

### 2.2 Network 隔离 + “可控网络”通道（P0 关键）

当启用 `--unshare-net` 时，sandbox 进程无法直接访问外网。为避免“Linux sandbox=断网”的高摩擦体验，Kode 复刻了官方同类机制：

- host 侧起 HTTP + SOCKS5 代理：`packages/core/src/sandbox/sandboxNetworkInfrastructure.ts`
- Linux host 侧用 `socat` 把 host proxy ports bridge 成 Unix sockets：`packages/core/src/sandbox/sandboxNetworkInfrastructure/linuxBridge.ts`
- sandbox 内再用 `socat TCP-LISTEN:3128/1080 → UNIX-CONNECT:<bridge.sock>` 暴露为 localhost TCP 代理端口：`packages/runtime/src/shell/linuxSandbox.ts`
- BashTool 负责把 `linuxBridge` 与固定端口注入到 sandbox 选项：`packages/tools/src/tools/system/BashTool/sandboxNetwork.ts`

依赖项（Linux）：

- `bwrap`（bubblewrap）
- `socat`

> 说明：`packages/core/src/sandbox/bunShellSandboxPlan.ts` 在 Linux 上会将 sandboxAvailable 判定为 `bwrap && socat`（与官方“Linux sandbox requires socat + bubblewrap”的依赖语义一致）。

## 3) macOS（sandbox-exec）行为细节

- profile：`packages/runtime/src/shell/macosSandbox.ts`（log tag `KODE_SANDBOX`）
- network：当需要限制网络时，依赖 host proxy ports，profile 只允许对 localhost 的 proxy ports 出站/入站
- violations：通过 `<sandbox_violations>` side-channel 附加到 stderr，UI 可剥离并做结构化展示

## 4) 权限与 UX 关联（最小摩擦 + fail-closed）

- Settings sandbox 的规则源：`.kode/settings.json`（canonical）+ legacy `.claude/settings.json`（只读兼容）
- 网络访问的“询问/记忆/拒绝”来自同一套 permission 引擎（domain allow/deny + optional ask callback），并由 host UI 提供交互（见 `ToolUseContext.options.requestToolUsePermission`）。

## 5) 已知缺口与下一步

- Linux seccomp（Unix socket blocking）：Kode 已支持 **可选启用**（当分发物包含 `apply-seccomp` + `unix-block.bpf` 时自动启用）；若资产缺失则会降级为 allowAllUnixSockets effective（见 `docs/research/claude-code/12_kode_vs_claude_full_parity_audit.md` 的 DP-015/DP-054）。
- Windows：当前不提供等价系统 sandbox；建议走“Execution Kernel 外置”（WSL2/VM worker/MCP）路径实现一致的强隔离与可控网络。
