# Kode server

This app hosts the local HTTP/WebSocket daemon, ACP stdio transport, workspace
operations, and the built Web UI. `src/index.ts` is the executable entry; server
implementation lives under `src/server/**`.

The daemon uses shared contracts from `packages/protocol` and orchestration from
`packages/core`. Client-side helpers live in `packages/client` so the Web UI and
external consumers do not import server implementation details.
