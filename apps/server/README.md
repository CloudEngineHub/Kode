# packages/daemon

本地 daemon（HTTP/WS）host：

- Node-compatible：用 `node:http` + `ws` 提供 WebUI 静态托管与事件流（WS）
- 复用 `#core/*` + `#protocol/*`，默认关闭（CLI `--web` opt-in）

包含：

- Server：`packages/daemon/src/server.ts`（`startKodeDaemon`）
- Client：`packages/daemon/src/client.ts`（`createKodeDaemonClient`）

对外复用：

- 安装 `@shareai-lab/kode` 后可通过 `@shareai-lab/kode/daemon-client` 引用 client（由 `scripts/build.mjs` 生成到 `dist/sdk/` 并通过 `package.json exports` 暴露）。
