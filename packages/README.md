# packages/

内部可复用模块集合（Engine/Protocol/Runtime/Tools/Hosts/Config）。

注意：当前仓库对外仍发布为单一 npm 包 `@shareai-lab/kode`。`packages/*` 是 monorepo 风格的内部模块分层（通过 TypeScript paths + 构建脚本组合产物）。

目录说明：

- `packages/config`：配置系统（profiles/pointers/repair/migrations）
- `packages/core`：headless 引擎（编排/权限/上下文/工具流水线）
- `packages/daemon`：本地 daemon（HTTP/WS + WebUI 静态托管）
- `packages/host-acp`：ACP host/transport（JSON-RPC over stdio）
- `packages/host-cli`：CLI host wiring（参数解析 + 连接 Ink UI）
- `packages/host-mcp`：MCP host（server/client 适配）
- `packages/protocol`：schema-first 协议（AgentEvent/会话日志/RPC/工具 schema）
- `packages/runtime`：运行时抽象接口（types）
- `packages/runtime-node`：Node.js 运行时实现（默认/基线）
- `packages/runtime-bun`：Bun 运行时实现（性能路径）
- `packages/tools-builtin`：内置工具集合（能力实现；UI 呈现逐步迁移到 host）

依赖规则（约束边界）：

- `packages/core` 不依赖 `ui/*`；所有交互通过事件/host 层呈现
- `packages/tools-builtin` 不依赖 `ui/ink`；工具呈现逐步迁移到 `ui/ink/src/toolPresenters/*`（host 可覆盖/承接渲染）
- `apps/*` 只承载可执行入口；构建入口统一在 `apps/kode/src/entrypoints/*`

对外 SDK：

- `@shareai-lab/kode/protocol`：协议与 schema（`dist/sdk/protocol.*`）
- `@shareai-lab/kode/daemon-client`：连接本地 daemon 的 client SDK（`dist/sdk/daemon-client.*`）
- `@shareai-lab/kode/core`：headless 引擎能力（`dist/sdk/core.*`）
- `@shareai-lab/kode/runtime`：运行时抽象接口 types（`dist/sdk/runtime.*`）
- `@shareai-lab/kode/runtime-node`：Node.js 运行时实现（`dist/sdk/runtime-node.*`）
