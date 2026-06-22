# AGENTS.md

This file guides automation/coding agents working in this repository.
For longer-form background (product intent, repo hygiene, and deeper design notes), see `AGENT_CONTEXT/README.md`.
For product-level UX intent and principles, see `docs/product/11_post_human_blueprint.md`.
For repeatable repo workflows (debug/test/build/release/compat), prefer the skill at `./.claude/skills/kode-repo-maintain/`.

## Product Intent (High Level)

- **Post-human workflows**: optimize for “one operator → many parallel actions” across coding and non-coding tasks.
- **Unit-agent CLI**: one consistent interface for human–computer work (tools, context, permissions, memory).
- **Multi-model + collaboration**: model profiles, sub-agents, and tool-orchestrated execution.
- **UX first**: fast feedback loops, low-friction defaults, and predictable guardrails.

## Repository Map

- `apps/cli/`: CLI entrypoints, command system, and Ink TUI (`apps/cli/src/entrypoints/cli.ts`).
- `apps/server/`: local server/daemon utilities and Web UI serving (`apps/server/src/server/webui.ts`).
- `apps/web/`: Web UI source; built into `dist/webui/**` during `bun run build`.
- `packages/core/`: orchestration engine, agent loading, permissions, MCP integration, and model wiring.
- `packages/tools/`: built-in tools (Task/Bash/WebFetch/WebSearch/Lsp/…) and their prompts/schemas.
- `packages/runtime/`: shell execution primitives + background task output store.
- `packages/config/`: config loading, data-root resolution, and schema.
- `packages/protocol/`: session/log protocol helpers (import/export, stream-json, etc.).
- `packages/builtin-skills/skills/`: bundled runtime skills shipped with the npm package.

## Development Commands

### Essential Workflow

```bash
# Install dependencies
bun install

# Run in development mode (hot reload with verbose output)
bun run dev

# Build the CLI wrapper for distribution
bun run build

# Clean build artifacts
bun run clean

# Run tests
bun test

# Check types
bun run typecheck

# Format code
bun run format
bun run format:check
```

### Build System Details

- **Primary build tool**: Bun (required for development)
- **Distribution (npm)**: `cli.js` wrapper runs the bundled Node.js runtime entry (`dist/index.js`)
- **Distribution (optional)**: standalone single-file binaries are built via `bun run build:binary` and published as GitHub Release assets
- **Main entrypoints**: `apps/cli/src/dispatch.ts` (dispatch) + `apps/cli/src/entrypoints/cli.ts` (Ink TUI)

### Publishing

```bash
# Publish to npm (requires build first)
npm publish
# Or with bundled dependency check skip:
SKIP_BUNDLED_CHECK=true npm publish
```

## System Architecture (Practical)

Kode is intentionally layered so UX, orchestration, and tool execution can evolve independently:

1. **Interaction/UI**: `apps/cli/src/ui/**` (Ink screens, overlays, input, and renderers)
2. **Orchestration**: `packages/core/src/engine/**` + `packages/tools/src/tools/ai/TaskTool/**`
3. **Tools**: `packages/tools/src/tools/**` (permission-aware, schema-first tool implementations)

## UX Guardrails (Low-friction by default)

- Avoid rigid “menus” and hidden mechanisms as the primary user path (not just install/setup); prefer intent-driven commands/screens and agent-driven actions with verification.
- Keep core flows resilient: avoid hidden coupling to unrelated third-party endpoints; prefer graceful fallbacks.
- Keep terminal UX predictable: clear state, minimal questions, concise output.

## Compatibility (Kode-first)

- `.kode/**` is the canonical write surface. Avoid implicit writes to legacy surfaces; treat `.claude/**` and `.claude-plugin/**` as read-compat + explicit import only (write there only when the user opts in).
- Keep interoperability terminology scoped: legacy labels are interoperability nouns, not the product narrative (apply “legacy” framing consistently in user-facing strings, code identifiers, and comments).
- Centralize all legacy aliases (env vars, headers, directory names, request-strategy labels) in the compat layer (`packages/core/src/compat/**`) and reference them via exported constants (e.g. `LEGACY_CLAUDE_ENV`) rather than hardcoded `CLAUDE_*` strings.

## Skills (Runtime Knowledge Packages)

This repo supports filesystem-discovered skills (`SKILL.md` packages) as a first-class mechanism for shipping on-demand workflows to the _running_ agent.

- **Packaging boundary**: content under `docs/` and `AGENT_CONTEXT/` is developer-facing only; runtime-required knowledge must live in shipped skill locations (bundled: `packages/builtin-skills/skills/**`, or user/project skill dirs).
- **Discovery order (Kode-first)**: bundled (`packages/builtin-skills/skills/**`) → `~/.kode/skills/**` → `./.kode/skills/**` → legacy read-compat (`~/.claude/skills/**`, `./.claude/skills/**`).
- **Progressive disclosure**: skill frontmatter is loaded at discovery; keep `description` keyword-rich and keep bodies short; push long references into `references/`/`scripts/` within the skill.
- **No hard install menus**: prefer intent-driven actions (SlashCommand/Skill/Task) over long “run these commands” menu flows.
- **Bundled skill pack**: keep bundled skills small, general-purpose, and platform-agnostic. Bundled skills live under `packages/builtin-skills/skills/**` and are discoverable via `/skills`; use `skill-judge` when auditing or improving skill design.
- **Repo maintenance skill**: prefer `./.claude/skills/kode-repo-maintain/` when work touches any of:
  - multi-file refactors or wide-reaching changes
  - build/release/packaging behavior
  - onboarding/capability UX changes (avoid “install menus”; keep flows intent-driven)
  - permissions or network tools (WebFetch/WebSearch)
  - compatibility/interop surfaces (`.kode/**`, `.claude/**`, env aliases)
  - “tool didn’t run / task output missing / session weirdness” debugging
  - If unsure, start by loading this skill and follow its scenario router + checklists; load only the relevant `references/**`.

## Permissions + Subagents (Gotchas)

- `allowedTools` constraints must be merged into the same permission engine as persisted rules; otherwise constraints silently won’t apply.
- Subagents inherit the parent `toolPermissionContext` and the invoking command’s constraints; they must not implicitly “auto-escalate” permissions.

## Async Tool Descriptions

Tool descriptions can be async functions and must be awaited:

```ts
// INCORRECT
const description = tool.description

// CORRECT
const description =
  typeof tool.description === 'function'
    ? await tool.description()
    : tool.description
```

## Debugging & Forensics (Session Storage)

When debugging “tool didn’t run / background task didn’t start / LLM gate blocked unexpectedly”, inspect the persisted artifacts under `~/.kode/`.

### Per-project data root

- `~/.kode/-Users-<you>-<path-to-project>/`

Useful subdirectories:

- `messages/`: conversation transcripts (includes tool_use + tool_result)
- `errors/`: error logs and structured dumps
- `tasks/`: background shell output files (`<bashId>.output`)

### Bash LLM intent gate debug dumps

If the gate fails closed (timeout / invalid output / API error), Kode writes a dedicated dump:

- `~/.kode/.../errors/bash-llm-gate/*.txt`

## Development Patterns

### Adding a Tool

1. Create `packages/tools/src/tools/<domain>/<ToolName>/`
2. Implement the tool + `prompt.ts` and Zod schema
3. Register in `packages/tools/src/registry.ts`
4. Add/update tests where there is existing coverage

### Adding a CLI Command

1. Add a command under `apps/cli/src/commands/**`
2. Register it in `apps/cli/src/commands/registry.ts`
3. Ensure help text is coherent with onboarding and permission model

## AI Context Notes

- 2026-06-06: The project has moved from ESLint 8 to ESLint 9 flat config (`eslint.config.mjs`). Do not restore `.eslintrc*`; `bun run lint` remains the lint command.
- 2026-06-05: When fixing Windows CI, check Bun's default 5 second test timeout, cross-file `mock.module` pollution, and `cmd /c` versus Unix shell differences before skipping tests.
- 2026-06-05: Background shell tests should wait for target stdout with `getBackgroundOutput` before asserting `readBackgroundOutput` cursor semantics.
- 2026-06-05: For `cmd /c` tests, avoid hand-written Windows quoting around `process.execPath`; prefer simple shell/cmd-compatible commands when only stdout is needed.
