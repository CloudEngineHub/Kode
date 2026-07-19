# Dependency Major Migration Plan

Prepared on 2026-07-08 for branch `future/refactor-integration`.

This document is the migration order for the remaining major dependency upgrades after the conservative dependency refresh. It is based on official migration guides and changelogs, plus a local scan of the current Kode call sites. Before executing any wave, refresh the linked official notes because these packages are still moving.

## Current Constraints

- Runtime floor is `node >=20.19.0` in `package.json`.
- GitHub workflows pin Node `20.19.0` in release, dev release, npm publish, and version bump jobs.
- The Web UI uses Vite 8 with `@vitejs/plugin-react` 6 and a simple `apps/web/vite.config.ts`.
- Build scripts still use `esbuild` directly for CLI, server, reachability, and binary builds.
- Zod schemas are part of public/internal contracts for protocol events, plugin validation, marketplace metadata, MCP tools, and tool inputs.
- OpenAI and Anthropic adapters rely on `zod-to-json-schema` and custom compatibility helpers.
- Undici is used directly for `fetch`, `ProxyAgent`, `dispatcher`, and WebSocket fallback paths.
- Commander is used throughout CLI parsing and command tests.
- Ink and terminal width packages are core CLI rendering dependencies, not cosmetic web dependencies.

## Official Source Snapshot

- Vite 8 migration guide: https://vite.dev/guide/migration
- `@vitejs/plugin-react` changelog: https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/CHANGELOG.md
- ESLint 10 migration guide: https://eslint.org/docs/latest/use/migrate-to-10.0.0
- Commander 15 release notes: https://github.com/tj/commander.js/releases
- OpenAI Node SDK migration guide: https://github.com/openai/openai-node/blob/main/MIGRATION.md
- OpenAI Node SDK changelog: https://github.com/openai/openai-node/blob/main/CHANGELOG.md
- Anthropic TypeScript SDK changelog: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/CHANGELOG.md
- Zod 4 migration guide: https://zod.dev/v4/changelog
- Undici 7 to 8 migration guide: https://undici.nodejs.org/best-practices/migrating-from-v7-to-v8
- Sharp 0.35 changelog: https://sharp.pixelplumbing.com/changelog/v0.35.0/
- Lucide v1 guide: https://lucide.dev/guide/version-1
- Glob changelog: https://github.com/isaacs/node-glob/blob/main/changelog.md
- Node HTML Parser changelog: https://github.com/taoqf/node-html-parser/blob/main/CHANGELOG.md
- Dotenv changelog: https://github.com/motdotla/dotenv/blob/master/CHANGELOG.md

## Migration Order

### Wave 1: Web Build Toolchain

Scope:

- `vite` 7 to 8.
- `@vitejs/plugin-react` 4 to 6.
- Web-only companions that compile through Vite, such as `lucide-react`, `react-resizable-panels`, and `@xterm/*`, only if they remain isolated to Web UI code.

Official change points:

- Vite 8 switches to Rolldown and Oxc instead of Rollup and esbuild for the main Vite pipeline.
- Vite 8 requires Node `20.19+` or `22.12+`.
- Vite 8 deprecates esbuild-oriented options in favor of Oxc and Rolldown options.
- Vite 8 changes CJS default import interop and may expose affected package imports.
- `@vitejs/plugin-react` 6 removes Babel-related features and requires Vite 8.
- Lucide v1 removes brand icons, sets icons `aria-hidden` by default, and removes the UMD build.

Local notes:

- `apps/web/vite.config.ts` is simple and does not currently use `rollupOptions`, `manualChunks`, or custom esbuild options.
- This wave raises the repo Node floor from `20.18.1` to `20.19.0` because release builds execute Vite.
- `scripts/build.mjs` invokes Vite for the web build but still uses direct esbuild elsewhere. Do not remove the direct `esbuild` dependency in this wave.
- `react-resizable-panels` is wrapped in `apps/web/src/components/ui/resizable.tsx`; compile this wrapper before assuming v4 is compatible.

Validation:

- `bun install`
- `bun run build:web`
- `bun run typecheck`
- `bun run build:npm`
- `bun test packages/core/src/test/integration/webui-static.test.ts packages/core/src/test/integration/webui-autodetect.test.ts`

### Wave 2: Node 20-Compatible Tooling

Scope:

- `eslint` 9 to 10 and `@eslint/js` 9 to 10.
- `prettier` patch/minor.
- `sharp` 0.34 to 0.35.
- `dotenv` 16 to 17.
- `env-paths` 3 to 4, only after confirming the local default-export shim still works.
- `glob`, `marked`, `node-html-parser`, and `js-yaml` if their runtime requirements remain compatible with the selected Node floor.

Official change points:

- ESLint 10 requires Node `>=20.19.0`, no longer supports old eslintrc config, changes config lookup, and adds new `eslint:recommended` rules.
- Sharp 0.35 requires Node `>=20.9.0`, removes the install script, changes native binary fallback behavior, and removes deprecated API fields.
- Dotenv 17 defaults runtime logging to visible unless `quiet` is set.
- Glob 13 moves the CLI to `glob-bin`; Kode currently imports the library API, not the CLI.
- Node HTML Parser 9 changed packaging through `tsdown`; verify ESM/CJS resolution.

Local notes:

- The Node `20.19.0` floor was already introduced by Wave 1 for Vite 8. Re-check workflow pins if this floor changes again.
- `packages/core/src/ai/llm.ts` imports `dotenv/config`; add an explicit quiet-loading path before moving to Dotenv 17 if startup logs are unacceptable.
- Sharp is dynamically imported in image helpers and has a local type shim in `packages/core/src/types/sharp.d.ts`.

Validation:

- `bun run lint`
- `bun run typecheck`
- `bun test`
- `bun run build:npm`
- Image read tests or manual image-read smoke if Sharp changes.

### Wave 3: Schema and Parser Semantics

Scope:

- `zod` 3 to 4.
- Any replacement or compatibility strategy for `zod-to-json-schema`.
- `node-html-parser`, `marked`, and `js-yaml` if not already handled in Wave 2.

Official change points:

- Zod 4 changes defaults inside optional fields, deprecates `.strict()` and `.passthrough()` in favor of `z.strictObject()` and `z.looseObject()`, removes `.nonstrict()` and `.deepPartial()`, changes `z.unknown()` and `z.any()` optionality inference, and changes `z.record()` behavior.

Local notes:

- Do not upgrade Zod before proving `zod-to-json-schema` compatibility or replacing it.
- Local schemas use `z.record(...)`, `.strict()`, and `.passthrough()` in protocol events, config parsing, plugin runtime, marketplace schemas, MCP tools, and tests.
- This wave can change accepted user/plugin data shape. Treat it as a contract migration, not just a typecheck fix.

Validation:

- `bun run typecheck`
- `bun test packages/protocol packages/config apps/cli/src/services packages/core/src/ai packages/ai`
- `bun test`
- CLI plugin and MCP smoke tests with extra/unknown fields.

### Wave 4: AI SDKs

Scope:

- `openai` 4 to latest 6.x.
- `@anthropic-ai/sdk`, `@anthropic-ai/bedrock-sdk`, and `@anthropic-ai/vertex-sdk` to latest compatible releases.

Official change points:

- OpenAI SDK v5 migrated to builtin Web Fetch APIs and changed web response/header types.
- OpenAI SDK v6 has Responses API type changes, including richer tool output item shapes.
- Anthropic SDK recent releases add new streaming events and beta headers. Review `system.message`, `stop_details`, server tool use, MCP tool use, and beta import paths before changing adapter types.

Local notes:

- Keep OpenAI and Anthropic migrations in separate commits.
- Kode has duplicated transitional OpenAI adapter paths under `packages/ai` and `packages/core/src/ai`; update both or remove the duplication first in a separate refactor.
- Proxy and custom fetch behavior depends on Undici `ProxyAgent` and `dispatcher`, so do not combine this with the Undici 8 migration.
- Preserve current compatibility helpers and add tests before changing stream event handling.

Validation:

- `bun test packages/core/src/test/unit/openai* packages/core/src/test/unit/*responses* packages/ai`
- `bun test`
- `bun run typecheck`
- Live or mocked provider smoke for OpenAI-compatible profiles, Responses API, and Anthropic streaming where credentials are available.

### Wave 5: Node 22 Runtime Floor

Scope:

- `commander` 13 to 15 and `@commander-js/extra-typings` 13 to 15.
- `undici` 7 to 8.
- Packages whose latest major expects newer Node/runtime behavior, including `which`, `spawn-rx`, `string-width`, `wrap-ansi`, and possibly TypeScript or Node typings depending on release compatibility.

Official change points:

- Commander 15 is ESM-only and requires Node `>=22.12.0`.
- Undici 8 requires Node `>=22.19.0`, changes dispatcher handler APIs, enables HTTP/2 by default when negotiated, and requires public global dispatcher APIs instead of internal symbols.

Local notes:

- This wave raises Kode's install/runtime contract. Do not perform it without intentionally changing `package.json` engines, GitHub workflow Node versions, packaging docs, and release smoke checks.
- CLI command parser tests should run before and after because Commander changes `--no-*` default handling.
- Network tests must cover `ProxyAgent`, explicit `dispatcher`, endpoint fallback, and WebSocket fallback.

Validation:

- `bun run typecheck`
- `bun test packages/core/src/test/unit/cli-* apps/cli/src/**/*.test.ts apps/cli/src/**/*.test.tsx`
- `bun test packages/core/src/test/unit/*openai* packages/ai`
- `bun test`
- `bun run build:npm`
- Temp install smoke on Node 22.19 or newer.

### Wave 6: CLI/TUI Rendering Stack

Scope:

- `ink` 6 to 7.
- `ink-link` 4 to 5.
- Terminal formatting packages such as `string-width`, `wrap-ansi`, and related CLI helpers if not already included in Wave 5.

Local notes:

- Ink is used throughout app startup, prompts, overlays, permission screens, tool presenters, and tests.
- Keep this after runtime/toolchain migrations so rendering failures are easier to attribute.

Validation:

- `bun test packages/core/src/test/e2e/tui-* packages/core/src/test/unit/*ui* packages/core/src/test/unit/*render*`
- `bun run typecheck`
- Manual CLI smoke for `kode --help`, interactive prompt, model selector, permission dialog, and file/tool output rendering.

## Commit and Gate Rules

- One wave per commit unless a package's official migration guide explicitly requires coupled upgrades.
- Do not combine Zod, OpenAI, Anthropic, Commander, Undici, or Ink major migrations with each other.
- Do not raise the Node floor without updating `package.json`, every `actions/setup-node` workflow pin, install docs, and temp install smoke.
- Re-run `npm outdated --json` and refresh official migration links before starting a wave.
- Each migration commit must include the official docs consulted in its commit body or PR description.
- If a wave changes package exports, CJS/ESM interop, runtime floor, schema behavior, or provider stream events, add or update focused tests before broad test runs.
- The minimum release gate after any code migration is:
  - `bun run typecheck`
  - `bun test`
  - `bun run build:npm`
  - `bun run baseline:refactor`
  - `npm pack`
  - Temp install smoke for `kode`, `kwa`, `kd`, `mcp-cli`, `kode-acp`, and SDK exports.

## Recommended Next Step

After Wave 1, continue with Wave 2 only: Node 20-compatible tooling. Do not start Zod, AI SDK, Commander, Undici, or Ink major migrations until the tooling wave is validated and committed.
