# CLI + Ink UI (commands, screens, and UX contracts)

Load this when you are changing:

- CLI commands (`apps/cli/src/commands/**`)
- command registration (`apps/cli/src/commands/registry.ts`)
- Ink UI screens/overlays (`apps/cli/src/ui/**`)
- onboarding/help flows

## Command system (where to change what)

- Commands live under `apps/cli/src/commands/**`.
- CLI entrypoint + dispatch: `apps/cli/src/dispatch.ts` and `apps/cli/src/entrypoints/cli.ts`.
- Registration happens in `apps/cli/src/commands/registry.ts`:
  - Built-in commands are listed in a memoized `COMMANDS()` function.
  - MCP and custom commands are loaded dynamically and merged into the final command list.
  - Avoid reading config at module initialization time; keep commands import-safe (follow the existing `COMMANDS()` pattern).

When adding a command:

1. Create the command module under `apps/cli/src/commands/**` following a nearby pattern.
2. Import + register it in `apps/cli/src/commands/registry.ts`.
3. Ensure `userFacingName()` and `aliases` are sensible and stable.
4. Ensure `isEnabled` gating is correct (disabled commands must not appear).
5. Avoid command-name collisions with MCP/custom commands (use `hasCommand` semantics as the mental model).

## Ink UI guidance (keep UX friction low)

- Prefer predictable flows and clear state over cleverness.
- For long-running work, use background-task patterns rather than blocking renders.
- Keep output concise and structured; avoid dumping huge logs into the UI.

## Key directories (common entrypoints)

- Screens + overlays: `apps/cli/src/ui/screens/**`
- Reusable components: `apps/cli/src/ui/components/**`
- Onboarding UI: `apps/cli/src/ui/screens/setup/**`
- Command implementations: `apps/cli/src/commands/**`

## Verification checklist

- `bun test` (focus on command/UI tests if present)
- Manually sanity-check the command list + help for discoverability
- Ensure onboarding/help text stays coherent and product-first
