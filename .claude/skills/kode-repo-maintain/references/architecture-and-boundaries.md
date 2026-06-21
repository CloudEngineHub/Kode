# Architecture + boundaries (what to touch, what not to mix)

Load this when you are:

- doing a refactor across multiple packages/modules
- changing data roots / persistence / protocol
- adjusting tool execution, permissions, or orchestration boundaries

## Mental model (3 layers)

1. **Interaction/UI** (`apps/cli/src/ui/**`)
   - Ink-based TUI, onboarding, overlays, permission prompts, rendering.
2. **Orchestration** (`packages/core/src/engine/**` + `packages/tools/src/tools/ai/TaskTool/**`)
   - tool routing, permission gating, session state, subagents/tasks coordination.
3. **Tools + Runtime** (`packages/tools/src/tools/**` + `packages/runtime/src/**`)
   - tool implementations + shell execution + background task output persistence.

Supporting pillars:

- **Config + roots**: `packages/config/src/**` (Kode-first roots, settings read/write, schemas)
- **Protocol**: `packages/protocol/src/**` (session/transcript helpers, import/export)
- **Server/WebUI**: `apps/server/src/**`, `apps/web/**`

## Cross-cutting boundaries (high risk areas)

### Persistence + data roots

- Keep `.kode/**` primary; legacy roots are interop inputs.
- Touchpoints: `packages/config/src/dataRoots.ts`, `packages/config/src/files.ts`, `packages/protocol/src/utils/**`.

### Permissions

- Treat permissions as a product surface: predictable prompts, conservative defaults.
- Touchpoints: `packages/core/src/permissions/**`, tool permission request UIs in `apps/cli/src/ui/**`.

### Tools

- Schema-first + permission-aware; avoid hiding network dependencies.
- Touchpoints: `packages/tools/src/tools/**`, `packages/tools/src/registry.ts`.

### Build + packaging

- `dist/**` is the package artifact; avoid committing it.
- WebUI is built into `dist/webui/**`; `apps/server/static/**` is a local-serving copy.
- Touchpoints: `scripts/build.mjs`, `package.json#files`.

## Refactor rules (to keep correctness + velocity)

- If you touch two layers, add a small verification point for each layer.
- If you touch persistence/roots/permissions, prefer adding a regression test.
- Avoid mixing “trace removal” cleanup with behavior changes; keep those separable.

## Pointers to deeper docs

- `AGENT_CONTEXT/README.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/system-design.md`
- `docs/compatibility.md`
