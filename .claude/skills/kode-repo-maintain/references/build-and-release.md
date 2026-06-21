# Build + Release + Packaging (Repo-specific)

Load this when you are changing any of:

- build scripts (`scripts/**`)
- publish/release automation (`scripts/publish-*.js`, `.github/workflows/**`)
- npm package contents (`package.json#files`)
- Web UI build/copy paths (`apps/web/**`, `dist/webui/**`, `apps/server/static/**`)

## Invariants (keep these true)

- `bun run build` must produce a runnable `dist/` (Node runtime baseline).
- What ships to npm is controlled by `package.json#files` (not by whatever happens to exist locally).
- `apps/server/static/**` is a **local-serving copy** of the Web UI build output and should be treated as a **generated artifact** (avoid committing it).

## What the build does (ground truth entrypoints)

### `bun run build`

Runs `scripts/build.mjs` and:

- Bundles runtime entrypoints into `dist/**` (esbuild)
  - e.g. `apps/cli/src/dispatch.ts` → `dist/index.js`
  - `apps/cli/src/entrypoints/cli.ts` → `dist/entrypoints/cli.js`
- Builds SDK subpath exports into `dist/sdk/**`
- Builds the Web UI and copies outputs:
  - `apps/web/dist/**` → `dist/webui/**`
  - `apps/web/dist/**` → `apps/server/static/**` (for local/dev serving)

### Key files (start here before editing build/release behavior)

- Build orchestration: `scripts/build.mjs`
- Web-only build+copy: `scripts/build-web.mjs`
- Binary build pipeline: `scripts/build-binary.mjs`
- Publish guardrails: `scripts/prepublish-check.js`
- Publish automation: `scripts/publish-dev.js`, `scripts/publish-release.js`, `scripts/set-version.mjs`
- Package boundary: `package.json#files`
- Server Web UI wiring: `apps/server/src/server/webui.ts`

### `bun run build:web`

Runs `scripts/build-web.mjs` and copies:

- `apps/web/dist/**` → `apps/server/static/**`

Note: `scripts/build-web.mjs` invokes `pnpm` (ensure the environment actually has it before relying on this path).

## Npm packaging boundary (what ships)

`package.json#files` is the contract. It currently includes:

- `dist/**/*` (including `dist/webui/**` when built)
- `resources/skills/**/*`
- wrappers like `cli.js` / `cli-acp.js`

It does **not** include `apps/server/static/**`, so committing `apps/server/static/**` only creates noisy diffs and merge conflicts.

## Change checklist (use before/after edits are “done”)

- Before changing packaging/build behavior:
  - Identify whether this affects **local dev**, **npm publishing**, **binary releases**, or all three.
  - Confirm the invariant you’re trying to preserve (startup, file layout, UX, size).
- After changing:
  - Run `bun run build`
  - Confirm `dist/**` looks correct (expected entrypoints exist)
  - Ensure `apps/server/static/**` remains untracked (or re-generated locally only)
  - Run: `bun test`, `bun run typecheck`, `bun run format:check`

## Common pitfalls

- Editing `package.json#files` without verifying install/runtime behavior (can silently break npm consumers).
- Accidentally committing `apps/server/static/assets/index-*.js` (hash files change frequently; pure noise).
- Mixing build-script refactors with unrelated product logic changes (makes reviews difficult and increases risk).
