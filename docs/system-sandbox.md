# System Sandbox（系统级隔离执行）设计与落地说明

本仓库当前已经具备“应用层权限控制”（tool permission + plan mode gating + 读写目录白名单）能力，但缺少“系统级隔离执行”（例如 Linux namespace / 无网络 / mount 视图隔离）来对进程级副作用做强约束。本文件记录当前缺口、可落地方案，以及跨平台（Linux/macOS/Windows）实现路径与取舍。

## 1. 现状与缺口

### 已有能力（应用层）

- 文件访问：`packages/core/src/utils/permissions/filesystem.ts` 维护读写授权目录集合，结合 permission UI 与 plan mode 规则约束读写。
- File 工具：`Read/Write/Edit` 系列工具通过 `hasReadPermission/hasWritePermission` + `secureFileService` 做路径规范化与安全读取。
- Bash 工具：`packages/tools-builtin/src/tools/system/BashTool/BashTool.tsx` 对 agent 模式的 `cd` 做目录边界限制；执行通过 `packages/core/src/utils/BunShell.ts`（基于 Node.js `child_process.spawn`，历史命名保留）。

### 主要缺口（系统级）

- 进程隔离：BashTool 运行的进程默认与宿主同权限/同网络/同文件系统视图。
- 网络隔离：无法在 OS 层禁止 `curl/wget/git` 等联网行为（只能在模型/提示词层约束或做命令黑名单）。
- 文件系统视图隔离：无法在 OS 层把“可读写根目录”限制为 workspace roots（应用层限制无法覆盖 Bash 内部行为）。

## 2. 落地策略（优先 Linux，可选开关）

### 2.1 目标

- 尽量对齐“参考实现”的行为：**agent 触发的 BashTool** 尽可能默认在受限环境运行；必要时可显式关闭（但在 safe mode 下禁止关闭）。
- **默认安全策略**：开启系统 sandbox 时，默认网络隔离（`network=none`），并把可写范围限制为 workspace root。
- 不影响现有用户交互：默认不强制开启；`--safe` 或环境变量开启。

### 2.2 当前已落地（代码）

- `packages/core/src/utils/BunShell.ts`
  - 增加 `BunShellExecOptions` / `BunShellSandboxOptions`，支持在 Linux 上用 `bwrap`（bubblewrap）包装命令执行（前台/后台都支持）。
  - bwrap 约束：
    - `--unshare-net`（默认）实现无网络
    - `--bind <projectRoot> <projectRoot>` 实现 workspace root 可写挂载
    - `--ro-bind / /` 将宿主文件系统映射为只读视图（再用 `--bind` 覆盖可写工作区挂载）
    - `--tmpfs /tmp`，并挂载 `/dev`、`/proc`
- `packages/tools-builtin/src/tools/system/BashTool/BashTool.tsx`
  - 支持 `dangerouslyDisableSandbox` 输入；在 `safeMode` 下直接拒绝（validateInput）。
  - sandbox 启用条件（默认安全行为）：
    - `commandSource === 'user_bash_mode'`：不启用（用户显式的 `!` 模式不应被“agent sandbox”影响）
    - `dangerouslyDisableSandbox === true`：不启用（但 safe mode 下禁止）
    - `safeMode === true` 或 `KODE_SYSTEM_SANDBOX=1/true/yes`：启用
    - 网络模式由 `KODE_SYSTEM_SANDBOX_NETWORK=inherit|none` 控制（默认 `none`）
- `packages/core/src/utils/sandbox/systemSandbox.ts`
  - 统一解析 `KODE_SYSTEM_SANDBOX` / `KODE_SYSTEM_SANDBOX_NETWORK`，并把 safe mode + commandSource 合成为最终决策（enabled/required/allowNetwork）。
- `packages/core/src/utils/messages.ts`
  - 用户 bash mode（`!`）直接调用 BashTool 时补齐 `commandSource: 'user_bash_mode'`，避免被 env/safe mode 误判成 agent_call。

### 2.3 使用方式（可选开关）

- 推荐（更安全）：`--safe`（会自动启用系统 sandbox 的“尝试启用”逻辑；在非 Linux 或缺少 bwrap 时会回退为普通执行）
- 显式启用（不依赖 safe mode）：
  - `KODE_SYSTEM_SANDBOX=1`
  - `KODE_SYSTEM_SANDBOX_NETWORK=none|inherit`（默认 `none`）

> 说明：当前实现为“best effort”。在非 Linux 或未安装 `bwrap` 时会回退为普通执行（不做 OS 级隔离），以避免影响日常使用。

## 3. macOS / Windows 可执行方案（建议路径）

### 3.1 macOS

可选方案（从“强隔离”到“工程可行”排序）：

1. **VM/Container Worker（推荐）**：将 bash/构建任务下沉到一个受控的本地 worker（例如 Lima/Colima / 轻量 VM），CLI 通过 IPC/MCP 远程执行；这在工程上最稳、隔离强、与未来“remote kernel”一致。
2. **sandbox-exec（不推荐）**：历史上可用但已被苹果标注为 deprecated；规则复杂且兼容性差，不建议作为长期方案。
3. **应用层加强（兜底）**：保留现有 permission + roots 白名单；增加“网络命令黑名单/提示词约束/审批链路”，但这不属于系统级隔离，只能降低风险。

### 3.2 Windows

可选方案：

1. **WSL2/Container Worker（推荐）**：将执行内核放在 WSL2 或容器中，CLI/IDE 侧通过 IPC/MCP 代理执行。
2. **AppContainer / Job Objects（中等）**：为子进程创建受限 token/AppContainer，配合 Job objects 做资源/进程树约束；实现成本高但可做到较强隔离。
3. **应用层加强（兜底）**：同 macOS。

## 4. all-in-bun 评估与建议

### 优势

- 统一的进程执行抽象（`BunShell`，历史命名保留）把超时/中断/后台任务管理收敛到一处，便于跨平台一致性与测试护栏。
- 与 CLI 交互（Ink）天然适配，便于将“后台任务输出/kill shell”等 UI 能力做成一致体验。

### 折中

- **真正的系统级 sandbox 无法仅靠 JS 运行时提供**：Linux 仍需要 bwrap / unshare / seccomp；macOS/Windows 需要 OS 原生机制或外部 worker。

### 建议

- 保持 **Node.js 作为生产运行时基线**；Bun 作为开发工具链与可选二进制打包器（不影响运行时逻辑）。
- 系统级隔离建议走 “Execution Kernel 外置” 思路：本地 CLI/IDE 侧保持 agent 编排不变，执行能力（shell/fs/net）通过可替换 kernel（本地 bwrap / WSL2 / VM worker / MCP）提供，逐步实现跨平台一致的强隔离。
