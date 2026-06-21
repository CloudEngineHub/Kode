# SDK & Integrations

Kode is a terminal-first product, but it also includes an **opt-in local daemon** which can be used as a lightweight “SDK backend” for:

- WebUI (browser)
- VSCode (webview)
- Scripts (Bun/Node)
- Other local frontends

The daemon exposes:

- `GET /health` (no auth)
- `GET /api/health` (token required)
- `WS /ws` (token required): **stream-json compatible** `AgentEvent` messages

> Compatibility: the default CLI behavior remains unchanged. WebUI/daemon are **opt-in** (`kode --web`).

## Quick Start (no network, echo mode)

Terminal 1 (start daemon; prints a URL including `?token=...`):

```bash
bun apps/kode/src/entrypoints/daemon.ts --echo
```

Terminal 2 (connect client and consume `AgentEvent` stream):

```bash
KODE_DAEMON_URL="http://127.0.0.1:12345?token=..." bun examples/daemon-client-echo.ts
```

## Event Model (schema-first)

- The WS stream emits `AgentEvent` objects validated by `packages/protocol/src/agentEvent.ts`.
- Today `AgentEvent` is aligned with the existing `stream-json` contract (so CLI/ACP/WebUI can share one format).

## Use as an SDK (installed package)

When you install `@shareai-lab/kode`, you can reuse the daemon client + protocol types:

```ts
import { createKodeDaemonClient } from '@shareai-lab/kode/daemon-client'
import { AgentEventSchema } from '@shareai-lab/kode/protocol'
import type { Runtime } from '@shareai-lab/kode/runtime'
import { createNodeRuntime } from '@shareai-lab/kode/runtime-node'
```

## Daemon entrypoint options

Use `apps/kode/src/entrypoints/daemon.ts`:

- `--host <host>` (default: `127.0.0.1`)
- `--port <port>` (default: `0` for random free port)
- `--cwd <cwd>` (default: current working directory)
- `--token <token>` (default: random UUID)
- `--echo` (test/demo mode: does not call any LLM)

## VSCode / WebUI

- WebUI is served by the daemon (static assets + WS events).
- VSCode PoC lives at `examples/vscode` and only embeds the WebUI URL in a webview (no engine/tool re-implementation).
