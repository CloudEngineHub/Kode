# packages/protocol

协议与 schema（事件模型、会话日志、RPC/传输模型、工具 schema）。

目标：CLI/WebUI/ACP/MCP 共用同一套类型与兼容契约。

对外集成：

- 安装 `@shareai-lab/kode` 后可通过 `@shareai-lab/kode/protocol` 引用运行时 schema（由 `scripts/build.mjs` 生成到 `dist/sdk/` 并通过 `package.json exports` 暴露）。该 JavaScript 接口在类型声明与兼容性门禁补齐前仍属于实验性集成面。

关键入口：

- `packages/protocol/src/agentEvent.ts`：`AgentEvent` union + `AgentEventSchema`
- `packages/protocol/src/structuredStdio.ts`：structured stdio 编解码
