# Agent Context (Developer-Facing)

This folder collects longer-form context for contributors and coding agents working on this repository. It is intentionally **developer-facing** (not runtime-critical).

## Product Intent (Why this exists)

Kode is a CLI agent designed for **post-human workflows**: one operator coordinating many parallel actions across human–computer tasks (coding and non-coding). The system emphasizes:

- **Unit-agent ergonomics**: one consistent interface for “ask → plan → do → verify”.
- **Multi-model + collaboration**: model profiles, sub-agents, and tool-orchestrated execution.
- **UX as a feature**: minimize friction in the terminal via predictable flows, clear state, and sensible defaults.

## System Mental Model (How it hangs together)

Think in three layers:

1. **Interaction/UI** (`apps/cli/src/ui/**`)
   - Ink-based TUI: REPL, overlays, onboarding, permission prompts, output rendering.
2. **Orchestration** (`packages/core/src/engine/**` + `packages/tools/src/tools/ai/TaskTool/**`)
   - Message pipeline, tool-call routing, session persistence, permission gating, sub-agent execution.
3. **Tools** (`packages/tools/src/tools/**`)
   - Schema-first tool implementations (Zod), prompts, and permission-aware execution.

Supporting modules:

- **Config** (`packages/config/**`): hierarchical config, roots, schemas, model profiles/pointers.
- **Protocol** (`packages/protocol/**`): transcript/session protocol helpers and import/export.
- **Runtime** (`packages/runtime/**`): shell execution + background output persistence.
- **Skills** (`packages/builtin-skills/skills/**`): bundled, on-demand runtime knowledge packages.

## Kode-first Compatibility (Interop without coupling)

Kode aims to interoperate with existing ecosystems while keeping a Kode-first mental model:

- Prefer `.kode/**` as the primary write target.
- Treat `.claude/**` and `.claude-plugin/**` as legacy compatibility surfaces (read/scan/import) rather than primary storage.
- Keep legacy env names and other compatibility “glue” centralized in a compat layer (see `packages/core/src/compat/legacyClaude.ts`), so core logic depends on abstractions rather than scattered literals.

## Packaging Boundary (What ships)

The published npm package contents are controlled by `package.json#files`. When adding “knowledge” that the _running agent_ must reliably access, place it in shipped locations (e.g. `packages/builtin-skills/skills/**`). Developer notes belong in `docs/**` or this folder.

## Generated Web UI Assets (Repo hygiene)

The Web UI is built into `dist/webui/**` for packaging. In development workflows, build scripts may also copy Web UI outputs into `apps/server/static/**` to simplify local serving. Treat `apps/server/static/**` as a generated artifact.

## Network Tools (Safety + UX)

Network-facing tools should remain:

- **Predictable** for users (clear permission prompts, clear host boundaries on redirects).
- **Resilient** in restricted environments (avoid hard dependencies on unrelated third-party “preflight” endpoints).
- **Conservative by default** when dealing with potentially sensitive URLs; add stricter modes behind explicit flags when needed.

## Contribution hygiene (keep diffs reviewable)

- Keep changes scoped; avoid mixing refactors, generated outputs, and feature work in one diff when possible.
- Run `bun test`, `bun run typecheck`, and `bun run format:check` before declaring a change “done”.
