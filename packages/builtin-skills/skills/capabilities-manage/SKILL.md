---
name: capabilities-manage
description: |
  Kode capability-management playbook: treat features (LSP, statusline, output styles, plugins, notifications) as configurable capabilities and drive changes through the agent CLI (SlashCommand/Task) instead of pushing users into menu-like flows. Use when the user asks to enable/disable/configure a capability, diagnose why it’s off, or wants the agent to self-manage Kode’s own features (meta capability management).
allowed-tools: SlashCommand Read Edit Task Skill
---

# Capabilities Manage

## Goal

Make users manage Kode features by expressing intent (“enable LSP for TS”, “fix my statusline”) while the agent performs the necessary actions via the agent CLI.

## Rules (do not violate)

- Do not output “installation menu” scripts or long lists of install commands.
- Prefer `SlashCommand` to run Kode commands (`/statusline`, `/lsp`, `/plugin ...`) instead of asking the user to do it manually.
- Keep changes minimal and reversible; verify after each change.

## Workflow

1. Clarify which capability: `statusline` / `lsp` / `output-style` / `plugins` (or multiple).
2. Inspect current state with minimal friction:
   - Read settings files (`~/.kode/settings.json`, `.kode/settings.local.json`).
   - For interactive status screens, ask the user to open them (single step): `/lsp`, `/output-style`.
3. Apply changes:
   - statusline: create a Task with subagent_type `statusline-setup` (do not ask the user to memorize the command).
   - lsp: ensure a plugin provides `.lsp.json` mappings; manage via `/plugin`, then re-check via `/lsp` screen.
   - output styles: set `outputStyle` in settings (or ask the user to choose via `/output-style`); for edits, edit the output style markdown file and then re-check `/output-style`.
4. Verify: re-check status screens and run a minimal real operation.

## Capabilities audit (recommended for `/capabilities`)

Keep this fast and low-friction: default output should be a short checklist and only one question when a choice is required.

1. Read current settings (best effort):
   - `~/.kode/settings.json` (global)
   - `.kode/settings.local.json` (project, if present)
2. Produce a compact checklist (OK / Needs attention) for:
   - Statusline: global `settings.json` contains `statusLine`.
   - Output style: either settings file contains a non-empty `outputStyle` string.
   - Plugins & LSP readiness: mention that LSP is plugin-driven; if the user cares, ask them to open `/lsp` (single step) to confirm resolved servers.
   - Permission friction: if the user reports unexpected denials/repeated prompts, invoke the `permissions-debug` skill.
3. Auto-fix what you can safely:
   - Statusline: if requested, create a Task with subagent_type `statusline-setup` (do not ask the user to memorize the command).
   - Output style: set `outputStyle` in `.kode/settings.local.json` (project) or `~/.kode/settings.json` (global) and re-read to verify.
4. Verify each fix immediately by re-reading the changed file(s) and summarizing what changed.
