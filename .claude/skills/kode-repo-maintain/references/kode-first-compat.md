# Kode-first compatibility (interop without coupling)

Load this when you are changing:

- config roots / data directories
- settings import/export or migration behavior
- legacy environment variables / header aliases
- user-facing text that mentions legacy surfaces

## The stance (keep it consistent)

- `.kode/**` is the **primary write surface**.
- `.claude/**` / `.claude-plugin/**` are **interoperability surfaces** (read/scan/import) unless the user explicitly opts in.
- Compatibility should be centralized behind abstractions so product code doesn’t depend on scattered legacy literals.

## Data roots (where user/project state lives)

Kode uses a Kode-first root with optional compatibility roots:

- Primary root: `~/.kode` (or env override)
- Compatibility roots: `~/.claude` (plus optional override)

Environment overrides:

- `KODE_CONFIG_DIR` (and `ANYKODE_CONFIG_DIR`) override the primary Kode root.
- `CLAUDE_CONFIG_DIR` should only influence **compat** roots, not the primary root.

Search entrypoint: `resolveDataRoots` under `packages/config/src/**`.

### Write policy (important)

Project/user settings should be written to `.kode/**`. If compatibility files exist, treat them as import sources (or read-only sync targets only when explicitly designed to be safe).

## Key files (start here)

- Data roots + overrides: `packages/config/src/dataRoots.ts`
- Settings read/write + legacy sync behavior: `packages/config/src/files.ts`
- Legacy env alias map: `packages/core/src/compat/legacyClaude.ts`
- Session protocol storage: `packages/protocol/src/utils/kodeAgentSessionLog.ts`

## Centralize legacy env names

Use `packages/core/src/compat/legacyClaude.ts` (`LEGACY_CLAUDE_ENV`) as the single source of truth for legacy env variable names. Do not introduce new raw `CLAUDE_*` literals elsewhere.

## De-legacy “trace removal” without breaking interop

When you see a legacy/third-party literal, classify it:

1. **Necessary interop glue** (env names, on-disk legacy directory names, header aliases)
   - Keep it, but move/keep it in compat code (`packages/core/src/compat/**`) and reference via abstractions.
2. **User-facing narrative**
   - Avoid centering other products; keep wording product-first and neutral.
3. **Pure residue**
   - Rename/remove (including comments), as long as you don’t break import/read compatibility.

Recommended searches:

```bash
rg "CLAUDE_" packages apps
rg -i "claude" packages apps
```

## Common pitfalls

- Making compatibility behavior the _default narrative_ in user-facing strings (creates confusion and unnecessary coupling).
- Adding a new legacy env/flag without centralizing it (scattered `process.env.FOO` becomes unmaintainable).
- Writing to legacy directories “for convenience” (breaks the Kode-first contract and can surprise users).

## Verification checklist

- `bun test` + `bun run typecheck`
- `rg "CLAUDE_"` shows only intentional compat points (not scattered business logic)
- Settings writes still land in `.kode/**` (no accidental legacy writes)
