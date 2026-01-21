---
name: lsp-maintain
description: Diagnose and align Kode LSP behavior with the reference CLI (plugin-based .lsp.json, stdio-only, no install menus). Use when LSP results are missing, LSP is disabled, or you need to configure plugin LSP servers without telling the user to run menu-style install commands.
allowed-tools: Read Edit SlashCommand
---

# LSP Maintain (Reference-aligned)

## Non-negotiables (policy)

- Do not respond with menu-style instructions like “run `/lsp-maintain install`” or “run `/lsp-maintain doctor`”.
- Prefer executing capability changes through `SlashCommand` (e.g. `/plugin ...`, `/lsp`) or `Edit` to configuration files.
- Keep the conversation focused: only load deeper resources if absolutely necessary.

## What “LSP enabled” means in Kode

Kode’s `LSP` tool is enabled only when there is at least one resolved LSP server and at least one is not in `error`.

## Step 1 — Establish facts (no guessing)

1. Ask for the user goal (languages, monorepo vs single package, whether they already use plugins).
2. Run `/lsp` via `SlashCommand` and read the “Configured servers” list.
3. If there are zero servers, conclude: **no LSP servers are configured** (do not speculate about missing binaries).

## Step 2 — Identify configuration source (plugin-only)

Kode resolves LSP servers from enabled plugins:

- Plugin root `.lsp.json` (JSON, top-level record)
- Plugin manifest field `lspServers` (inline record or relative file path within plugin root)

If the user needs a new server, the correct path is: enable a plugin that provides it, or add/update a plugin’s `.lsp.json`.

## Step 3 — Apply changes through agent CLI

Prefer:

- Use `SlashCommand` to manage plugins (`/plugin ...`) and re-check with `/lsp`.
- Use `Edit` to update the plugin’s `.lsp.json` or manifest `lspServers` record/file.

## Step 4 — Verify

1. Re-run `/lsp` and confirm servers are resolved.
2. Attempt one `LSP` tool call (e.g. `goToDefinition`) on a file extension that is mapped in `extensionToLanguage`.

## Notes for LSP server config authoring

- `command` must be an executable (avoid embedding arguments; use `args`).
- Kode runs servers using stdio pipes.
- Do not use `restartOnCrash`, `startupTimeout`, or `shutdownTimeout` in the config (Kode treats them as unsupported).
