# Kode 系统设计（概览）

本文档给出当前仓库的「真实」结构概览，并指向更详细的设计/实现文档，避免重复维护造成文档漂移。

## 目标与原则

- **Node.js 作为生产运行时基线**：npm 用户不需要安装 Bun。
- **Bun 作为开发/构建工具链**：用于本地开发、构建、测试；并可用于生成原生二进制。
- **多 Host 复用**：CLI（Ink TUI）/ACP/MCP/daemon/WebUI 尽量复用同一套 `protocol + core + tools`。

## 入口与构建

- 统一入口（dispatcher）：`apps/kode/src/index.ts`（`--help-lite/--version` 早返回，避免冷启动开销）
- 运行模式入口：`apps/kode/src/entrypoints/*`（构建到 `dist/entrypoints/*`）
- 构建脚本：`scripts/build.mjs`（输出 `dist/*`，并生成 `cli.js`/`cli-acp.js` wrapper）
- 运行时 wrapper：`scripts/cli-wrapper.cjs`（优先原生二进制 → 回退 `node dist/index.js`）

## 目录分层（当前）

- `packages/protocol`：schema-first 协议与事件模型（`AgentEvent`、session log、structured stdio 等）
- `packages/core`：引擎与共享领域模块（headless turn runner 在 `packages/core/src/engine/*`）
- `packages/tools-builtin`：内置工具集合与注册表（能力实现 + 可序列化输出；呈现层在 UI）
- `packages/host-*`：各类 host/transport 适配（CLI/ACP/MCP）
- `packages/daemon`：本地 daemon（HTTP/WS + WebUI 静态托管）与 client SDK
- `ui/ink`：Ink TUI（screens/components/presenters）
- `ui/web`：内置 WebUI（Vite/React），由 daemon 托管

## 深入阅读（推荐）

- vNext 目标形态：`new_plan/02_target_architecture.md`
- 任务拆解与验收：`new_plan/todo_tasks_detail.md`
- 开发文档（实现角度）：`docs/develop/architecture.md`
- daemon/client SDK：`docs/sdk/README.md`
- 历史深度分析（可能包含旧路径/旧名词）：`docs/_archive/2025-12/system-design-deep-dive.md`
