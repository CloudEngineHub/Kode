# Claude Code Alignment (Plan Mode · MCP)

This document captures **Claude Code behaviors we observed** (with concrete code evidence) and how Kode aligns while keeping **Kode-first** invariants:

- Canonical write surface: `~/.kode/**`
- Legacy read-compat only (never mutate): `.claude/**` + `.claude.json`

## Evidence anchor (no-hallucination)

- Claude Code artifact: `<CLAUDE_CODE_PKG_ROOT>/cli.js` (machine-specific path; example from this workstation: `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code/node_modules/@anthropic-ai/claude-code/cli.js`)
- Package: `@anthropic-ai/claude-code@2.1.22`
- Build time (string literal): `BUILD_TIME:"2026-01-28T06:33:34Z"` (cli.js contains the literal at line `408`)
- sha256 (of `cli.js`): `da39b2c9fe9de2406e05b2f78451610416f2cba2ac624bc21d35d51a50c2d761`

> Notes on evidence format:
>
> - `cli.js:<line>` refers to the line number reported by ripgrep on the minified file.
> - Quotes below are intentionally short.

---

## 1) Plan mode

### 1.1 Claude Code (observed)

**Plan file location**

- Claude Code explicitly documents: `Plans are stored in \`~/.claude/plans/<slug>.md\``. (cli.js:5898)

**Plan mode “exit” UI (the “Would you like to proceed?” selector)**

- The “Ready to code?” screen contains the literal `Would you like to proceed?` (cli.js:6122).
- Option label literal exists: `Yes, clear context and bypass permissions` (cli.js:6115).
- The footer shows `ctrl-g to edit in` (cli.js:6122).

**Additional plan-exit options (swarm + push-to-remote)**

- Claude Code includes swarm option labels like `Yes, and launch swarm (`…`)` and emits `launchSwarm:!0` + `teammateCount` when selected. (cli.js:6115)
- Claude Code also supports `yes-push-to-remote` with screens titled `Pushing to remote…` and `Push to remote unavailable`. (cli.js:6117, cli.js:6122)

**Plan mode required gating**

- Claude Code checks `process.env.CLAUDE_CODE_PLAN_MODE_REQUIRED==="true"`. (cli.js:590; token presence also at cli.js:2222)

**Plan-mode reminders (full vs sparse + cadence)**

- Claude Code produces plan-mode reminders as a cadence of _attachments_, with fixed spacing and a “full reminder every N attachments” rule:
  - Cadence constants (includes both): `vHK={TURNS_BETWEEN_ATTACHMENTS:5,FULL_REMINDER_EVERY_N_ATTACHMENTS:5}` (cli.js:3221)
  - Reminder selection: `let O=(wC2(A??[])+1)%vHK.FULL_REMINDER_EVERY_N_ATTACHMENTS===1?"full":"sparse";` (cli.js:3221)
- Rendering logic distinguishes `full` vs `sparse` vs `subagent`:
  - `if(A.isSubAgent)return DI2(A);if(A.reminderType==="sparse")return WI2(A);return ZI2(A)` (cli.js:3751)

### 1.2 Kode alignment (implemented)

**Storage + compat**

- Canonical plan directory defaults to `~/.kode/plans` (configurable via `plansDirectory` setting): `packages/core/src/plan/mode/paths.ts:32`.
- Legacy read-compat: when the primary plan file doesn’t exist, Kode best-effort reads `~/.claude/plans/<filename>.md` and migrates content into `.kode`. `packages/core/src/plan/mode/paths.ts:148`.

**Exit plan mode UI (TUI parity)**

- UI screen (“Ready to code?” + “Would you like to proceed?” + option labels) is implemented in: `apps/cli/src/ui/components/permissions/PlanModePermissionRequest/ExitPlanModePermissionRequest.tsx:659`.
- Option labels match the Claude Code set shown in the user screenshot (and the `cli.js:6115` literal), implemented in: `apps/cli/src/ui/components/permissions/PlanModePermissionRequest/ExitPlanModeOptions.ts:21`.
- `Ctrl+G` external editing is supported and re-reads the plan file after edit: `apps/cli/src/ui/components/permissions/PlanModePermissionRequest/ExitPlanModePermissionRequest.tsx:691`.

**Plan-mode reminders (Kode parity)**

- Plan-mode reminders are injected as system prompt additions (so they guide the model without bloating the visible transcript) with the same cadence/shape:
  - Spacing + full-vs-sparse cadence: `packages/core/src/plan/mode/systemPrompt.ts:30` (5 turns) and `packages/core/src/plan/mode/systemPrompt.ts:31` (full every 5 attachments).
  - The selected reminder text matches the corresponding Claude Code strings (full/sparse/subagent) via `packages/core/src/plan/mode/reminders.ts:39`.
  - Exit boundary resets the full/sparse cycle: `packages/core/src/plan/mode/state.ts:92` + `packages/core/src/plan/mode.ts:69`.

**Plan mode required gating (Kode-first + legacy env)**

- Primary env: `KODE_PLAN_MODE_REQUIRED` (and compatible fallback to `CLAUDE_CODE_PLAN_MODE_REQUIRED`) is enforced by the permission context layer: `apps/cli/src/ui/contexts/PermissionContext.tsx:40`.
- CLI entrypoint sets `KODE_PLAN_MODE_REQUIRED=true` when appropriate flags are used: `apps/cli/src/entrypoints/cli/cliParser/rootAction.ts:147`.

**Filesystem permission special-case**

- Plan mode must be able to write its plan file(s) even when file permissions are otherwise strict.
- Kode allows writing both the main plan file and per-agent plan files for the active conversation: `packages/core/src/permissions/filesystem.ts:65` (via `isPlanFilePathForActiveConversation`).

### 1.3 Remaining deltas (explicit)

Claude Code also contains plan-exit flows for:

- “Push to remote…” and “Push to remote unavailable” screens (cli.js:6122).
- Swarm-launch options embedded in the plan-exit option list (same region as the option literals, cli.js:6115).

Kode implements swarm-launch end-to-end (including wiring plan-exit selections into the tool input and launching background teammates), and keeps the push-to-remote path behind a feature flag (failing closed with a dedicated UX screen until the remote runtime is finalized).

Key technical delta vs Claude Code:

- Claude Code’s plan-exit UI calls `onAllow({...LA,launchSwarm:!0,teammateCount:_}, ...)` / `onAllow({pushToRemote:!0,...}, ...)` (cli.js:6117), meaning the UI can attach additional fields to the plan-exit tool result.
- Kode supports attaching additional tool input fields via permission allow decisions (see `CanUseToolFn` / `updatedInput`), enabling the swarm-launch parity path.

---

## 2) MCP (/mcp)

### 2.1 Claude Code (observed)

**MCP menu + actions**

- MCP overlay title literal: `Manage MCP servers`. (cli.js:4254; also cli.js:4282)
- The list footer includes `Run claude --debug`. (cli.js:4254)
- Action literals include `View tools`, `Re-authenticate`, `Clear authentication`. (cli.js:4254)

**Scopes**

Claude Code renders the scope labels:

- `Project MCPs` / `User MCPs` / `Local MCPs` / `Enterprise MCPs` / `Built-in MCPs`. (cli.js:4254)

**Config surfaces**

- The artifact contains `.claude.json` as a configuration surface (token occurrences at cli.js:5229, 5230, 6205).
- The artifact contains `.mcp.json` as a project config filename (token occurrences include cli.js:194, 831, 1609).

### 2.2 Kode alignment (implemented)

**/mcp overlay**

- The TUI overlay is implemented in `apps/cli/src/ui/screens/overlays/McpServersScreen.tsx:271`.
- It supports:
  - server list grouped by scope (project/local/user/built-in),
  - per-server detail view (status/auth/url/command/args/config location),
  - actions: View tools / Authenticate / Re-authenticate / Clear auth / Reconnect / Disable.

**Config sources + Kode-first precedence**

- Primary configuration lives under Kode settings and per-project MCP files (`.mcp.json` and `.mcprc`), with approval gating for project-scoped servers (`apps/cli/src/entrypoints/cli/mcpServerApproval.tsx`).
- Legacy read-compat: Kode reads MCP definitions from `~/.claude.json` (without writing to it) via `packages/config/src/compat/legacyClaudeJson.ts` and merges them into the in-memory server list. The canonical write surface remains `.kode`.

**Reset approvals**

- Kode implements `mcp reset-project-choices` parity (and a dedicated `reset-mcprc-choices`) at `apps/cli/src/entrypoints/cli/commands/mcp/reset.ts:6`.

### 2.3 Remaining deltas (explicit)

Claude Code’s MCP selector explicitly has an `agentServers` slice (`{servers:q,agentServers:Y,...}`) and an `enterprise` scope label mapping (`Enterprise MCPs`). (cli.js:4254)

Kode now exposes an `Agent MCPs` scope in the `/mcp` overlay and includes the `Enterprise MCPs` label mapping to match the observed Claude Code scope vocabulary, while preserving Kode-first config precedence and legacy read-compat.
