# Kode Project Structure

Kode is organized as a monorepo-style workspace, but is published as a single npm package (`@shareai-lab/kode`).

## Build + runtime model

- **Dev/build toolchain**: Bun (required for development).
- **Production runtime baseline**: Node.js (no Bun required for users).
- **Entry wrapper behavior**: prefer native binary via npm `optionalDependencies` (`@shareai-lab/kode-bin-<platform>-<arch>`) → fallback to Node.js runtime (`dist/index.js`).

## Repository layout

```
.
├── apps/
│   ├── cli/                     # CLI app (dispatch + Ink TUI)
│   │   └── src/
│   │       ├── dispatch.ts      # Build entry (bundles to dist/index.js)
│   │       └── entrypoints/     # Build entrypoints → dist/entrypoints/*
│   ├── server/                  # Local daemon/server and WebUI host
│   └── web/                     # Built-in WebUI (Vite/React)
├── packages/
│   ├── core/                    # Engine + shared domain modules (query/permissions/context/etc.)
│   ├── protocol/                # Schema-first protocol + event models
│   ├── tools/                   # Built-in tools (capabilities + structured outputs)
│   ├── config/                  # Config system (profiles/pointers/migrations)
│   ├── runtime/                 # Runtime interface types + implementations
│   ├── client/                  # Internal daemon client helpers
│   ├── kode-bin-*/              # Per-platform native CLI binaries (npm optionalDependencies)
│   └── kode-ripgrep-*/          # Per-platform ripgrep binaries (npm optionalDependencies)
├── scripts/                     # Build/publish tooling
├── docs/                        # User + developer documentation
├── examples/                    # Daemon and agent examples
├── bun.lock                     # Committed reproducible dependency graph
├── tsconfig.json                # TS config + minimal `#...` path aliases
└── package.json                 # Package boundary and narrow integration exports
```

## Outputs

`bun run build` produces:

- `dist/index.js` (Node ESM entry)
- `dist/entrypoints/*` (cli/mcp/daemon)
- `dist/sdk/*` (`@shareai-lab/kode/protocol` and `.../daemon-client`)
- `dist/webui/*` (if `apps/web` build is available)
- `cli.js` / `cli-acp.js` / `mcp-cli.js` (runtime wrappers)

All outputs above are ignored by Git and generated in CI before packaging.

`bun run build:binary` produces:

- `dist/bin/<platform>-<arch>/kode(.exe)` (single-file native executable)

## Useful commands

```bash
bun install --frozen-lockfile
bun run dev
bun run build
bun run typecheck
bun test
bun run format
```
