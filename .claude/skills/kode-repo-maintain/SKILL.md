---
name: kode-repo-maintain
description: |
  Repo-maintenance skill for the Kode CLI monorepo (Bun + Ink). Use when you need high-confidence, reviewable changes or a reliable workflow for:
  - product UX defaults (post-human, unit-agent, low friction; avoid menu-driven primary flows; capability management via agent interactions),
  - Kode-first compatibility + legacy interop (.kode writes; .claude read/import; env/header aliases behind `packages/core/src/compat/**`),
  - permission + tool boundaries (including subagents, `allowedTools`, WebFetch/WebSearch),
  - build/release/packaging (dist/webui/binaries/CI),
  - debugging sessions/tasks/forensics and recovery.
  Keywords: bun, ink, cli, agent, ux, capabilities, onboarding, tools, permissions, webfetch, websearch, mcp, lsp, skills, compat, legacy, .kode, .claude, data roots, packaging, release, ci, tests, repo hygiene
license: Apache-2.0
compatibility: Requires Bun + git (Node >= 18 recommended) and a local clone of this repository.
metadata:
  author: shareAI-lab
  version: '1.4'
---

# Kode Repo Maintain

Use this skill when you are working _inside this repository_ and you need a repeatable, low-friction workflow for maintenance, debugging, refactors, or feature work.

## How to use this skill (progressive disclosure)

- Do **not** treat this as a tutorial. Use it as a _decision + workflow_ layer: what matters, what to avoid, and how to verify changes.
- Start from the **Scenario Router** below and load **only** the relevant reference file(s).
- References under `references/` contain repo-specific details and “gotchas”. Load them when the scenario matches (and avoid loading unrelated ones).

## Non‑negotiables (quality laws)

1. **Understand before changing**: reproduce or observe first; don’t “patch by vibe”.
2. **Surface decisions**: call out trade-offs (UX, safety, compatibility, packaging) instead of silently choosing.
3. **Verify atomically**: after each chunk, re-run the smallest check that proves correctness.
4. **Keep diffs reviewable**: separate refactors, behavior changes, and generated outputs.
5. **Kode-first compatibility**: keep core logic product-first; isolate interoperability glue behind compat abstractions.

## Anti‑patterns (NEVER)

- NEVER commit generated local-serving artifacts (notably `apps/server/static/**`).
- NEVER scatter legacy env/header strings across the codebase; route through `packages/core/src/compat/**`.
- NEVER add hidden coupling to unrelated third-party endpoints for “preflight” behavior in core flows.
- NEVER ship menu-driven UX as the primary path (including “install/setup menus”); prefer intent-driven flows and verifiable actions.
- NEVER “fix” by broad rewrites when a focused change (plus a test) can prove correctness.

## Fast path (most changes)

Run these before declaring “done”:

```bash
bun test
bun run typecheck
bun run format:check
```

Useful during iteration:

```bash
bun run dev
```

## Scenario Router (MANDATORY reference loads)

Pick the closest match. If it applies, **MANDATORY – READ ENTIRE FILE** before changing code:

| Scenario                                                                                   | Must load                                   | Avoid loading                           |
| ------------------------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------- |
| You’re changing build/publish/release/binaries/webui packaging                             | `references/build-and-release.md`           | `references/tools-and-permissions.md`   |
| You’re editing compatibility/interop (roots, env aliases, “legacy” names)                  | `references/kode-first-compat.md`           | `references/build-and-release.md`       |
| You’re adding/changing a Tool or a permission boundary                                     | `references/tools-and-permissions.md`       | `references/build-and-release.md`       |
| You’re changing the CLI/Ink TUI flows or command registry                                  | `references/cli-and-ui.md`                  | `references/debugging-and-forensics.md` |
| You’re debugging “tool didn’t run / task output missing / weird session behavior”          | `references/debugging-and-forensics.md`     | `references/cli-and-ui.md`              |
| You’re changing onboarding/capability UX (avoid “install menus”, keep flows intent-driven) | `references/product-and-ux.md`              | `references/debugging-and-forensics.md` |
| You’re adding tests or debugging CI failures                                               | `references/testing-and-ci.md`              | `references/product-and-ux.md`          |
| You’re cleaning repo hygiene (docs sprawl, git noise, generated artifacts)                 | `references/repo-hygiene.md`                | `references/testing-and-ci.md`          |
| You’re doing a cross-layer refactor (touching multiple packages/modules)                   | `references/architecture-and-boundaries.md` | `references/debugging-and-forensics.md` |

## Repo map (where to look first)

- CLI + Ink TUI: `apps/cli/src/**`
- Orchestration + permissions: `packages/core/src/**`
- Tools (schemas + prompts): `packages/tools/src/tools/**`
- Shell/runtime + background tasks: `packages/runtime/src/**`
- Config + data roots: `packages/config/src/**`
- Session/protocol helpers: `packages/protocol/src/**`
- Bundled runtime skills: `packages/builtin-skills/skills/**`

## Definition of done (use as a final checklist)

- Scope is clear (what changed + what intentionally didn’t).
- Verification ran: `bun test`, `bun run typecheck`, `bun run format:check`.
- No generated artifacts accidentally committed (especially `apps/server/static/**`).
- Compatibility glue remains centralized (no scattered legacy literals).
- UX remains low-friction: good defaults, clear fallbacks, no silent coupling.
- No “install/setup menu” UX introduced as a default path; capability management stays intent-driven + verifiable.

## Key docs (open these when needed)

- `AGENTS.md` (repo-level contract and commands)
- `AGENT_CONTEXT/README.md` (deeper architecture + repo hygiene)

## Maintaining this skill (keep repo knowledge clean)

- Keep `AGENTS.md` short and stable; put workflow-heavy guidance in this skill.
- When a new recurring scenario appears, add a focused file under `references/` and a row in the **Scenario Router**.
- Prefer “decision + pitfalls + verification” over long tutorials.
