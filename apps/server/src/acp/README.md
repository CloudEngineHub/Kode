# packages/host-acp

ACP（Agent Client Protocol）host/transport 适配：

- JSON-RPC over stdio（以及未来 WS/HTTP 变体）
- 与 core/protocol 共用 schema

入口：

- `apps/kode/src/entrypoints/acp.ts`（安装 stdout guard，启动 stdio transport）

关键文件：

- `packages/host-acp/src/kodeAcpAgent.ts`：ACP 方法适配到内部引擎能力
- `packages/host-acp/src/stdoutGuard.ts`：确保 stdout 只输出协议内容（避免破坏 client）
