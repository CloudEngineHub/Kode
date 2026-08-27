# Daemon integrations

Kode is terminal-first. Its opt-in local daemon provides a small integration
surface for the built-in Web UI, scripts, and other local clients.

The daemon exposes:

- `GET /health` without authentication.
- `GET /api/health` with the daemon token.
- `WS /ws` with the daemon token, emitting `AgentEvent` objects compatible with
  the CLI's `stream-json` format.

The default CLI behavior is unchanged. Start the daemon explicitly with
`kode --web`.

## Local echo example

Terminal 1:

```bash
bun apps/cli/src/entrypoints/daemon.ts --echo
```

Terminal 2, using the URL printed by the daemon:

```bash
KODE_DAEMON_URL="http://127.0.0.1:12345?token=..." \
  bun examples/daemon-client-echo.ts
```

## Package integration surface

The npm package exposes two intentionally narrow JavaScript subpaths:

```js
import { createKodeDaemonClient } from '@shareai-lab/kode/daemon-client'
import { AgentEventSchema } from '@shareai-lab/kode/protocol'
```

`packages/core`, `packages/tools`, `packages/runtime`, and `packages/client` are
private workspace modules, not public package APIs. The two integration
subpaths above do not yet ship TypeScript declarations; treat them as an
experimental JavaScript contract until declarations and compatibility tests are
part of the release gate.

## Daemon source options

The source entrypoint at `apps/cli/src/entrypoints/daemon.ts` accepts:

- `--host <host>` (default: `127.0.0.1`)
- `--port <port>` (default: `0`, selecting a free port)
- `--cwd <cwd>` (default: the current working directory)
- `--token <token>` (default: a random UUID)
- `--echo` (test mode without an LLM request)
