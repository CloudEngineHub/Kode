# Architecture

Kode is a Bun-developed, Node-compatible monorepo published as one npm package
plus optional per-platform binary packages.

## Runtime flow

```text
CLI / ACP / MCP / daemon
          |
          v
apps/cli or apps/server       host-specific I/O and presentation
          |
          v
packages/core                conversation, permissions, sessions, models
          |
          +--> packages/tools     tool schemas and execution behavior
          +--> packages/runtime   process, shell, sandbox, background tasks
          +--> packages/config    settings, roots, compatibility inputs
          +--> packages/protocol  persisted and transport contracts
          |
          v
model providers / filesystem / processes / MCP servers
```

`apps/web` is a client of the daemon through `packages/client` and
`packages/protocol`. It is built into `dist/webui/**`; the daemon's local static
copy is generated and never committed.

## Module seams

- Hosts own parsing, terminal rendering, HTTP/WebSocket transport, and user
  interaction.
- Core owns orchestration and policy. It should not gain new host-specific
  dependencies.
- Tools own capability behavior and permission requests. Tool presentation is
  currently still partially coupled to Ink; this is known architectural debt,
  not a desired interface.
- Runtime owns operating-system behavior and must not depend on core or a UI.
- Protocol owns formats that must survive refactors and cross-process use.
- Config owns `.kode` writes and legacy `.claude` read/import compatibility.

## Convergence status

The current code is a strong single-process CLI baseline, but the package graph
is not yet the optimal shape for concurrent daemon sessions or a general-purpose
runtime. Four historical reverse-dependency seams remain:

```text
config <-> runtime
core <-> protocol
core <-> tools
tools  -> CLI presentation
```

These edges are allowlisted by exact source file in
`scripts/check-architecture.mjs`. CI rejects new reverse dependencies, so the
list can shrink without silently growing elsewhere.

The intended convergence order is:

1. Make config a pure settings/data-root module and inject runtime process and
   filesystem behavior.
2. Keep protocol limited to schemas and codecs; move session storage and engine
   errors to their owning modules.
3. Extract the minimal tool and permission contracts that both core and tool
   implementations need, breaking the core/tools cycle.
4. Return data-only tool results and move Ink renderers into the CLI host.
5. Replace process-global conversation state with one runtime object per
   session before treating the daemon as a mature multi-session host.

This order preserves the stable CLI while creating testable seams. A large
package reshuffle before those ownership changes would move files without
removing the coupling.

## Build and distribution

`bun run build` creates the Node runtime, two narrow integration subpaths
(`protocol` and `daemon-client`), Web UI assets, and CLI wrappers under ignored
paths. Native CLI and ripgrep binaries are generated or downloaded in the
tagged-release workflow and published in platform-specific optional-dependency
packages. The main package is published last so it never references platform
package versions that were not published successfully.

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the directory map and
[develop/releasing.md](develop/releasing.md) for the release contract.
