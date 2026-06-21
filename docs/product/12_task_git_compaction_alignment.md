# Claude Code Alignment (Tasks · Workspace Safety · Context Compaction)

This document captures the **Claude Code behavior we observed** (with concrete code evidence) and the **Kode-first design** that aligns with it while extending toward “post-human workflows” (one operator → many parallel actions).

## Evidence anchor (no-hallucination)

- Claude Code artifact: `<CLAUDE_CODE_PKG_ROOT>/cli.js` (`@anthropic-ai/claude-code@2.1.22`, `BUILD_TIME:"2026-01-28T06:33:34Z"`)
- sha256: `da39b2c9fe9de2406e05b2f78451610416f2cba2ac624bc21d35d51a50c2d761`
- Version/sha inventory: `docs/research/claude-code/01_inventory.md`

## 0) Problem framing (user mental model)

Users don’t want to manage “menus” or hidden systems. They want a single unit-agent that:

- Maintains a **persistent task board** that survives agent switches and session resumes.
- Prevents silent “workspace foot-guns” (e.g. one agent `git checkout` nukes another agent’s assumptions).
- Keeps long sessions usable via **model-aware compaction** that preserves the state needed to continue.

## 1) Task system: behavior + mechanism

### 1.1 Claude Code (observed)

**Task list identity**: Claude Code derives a `taskListId` with a clear override precedence:

- Explicit env override exists. In Claude Code we see: `CLAUDE_CODE_TASK_LIST_ID`.  
  Evidence (excerpt): `if(process.env.CLAUDE_CODE_TASK_LIST_ID)return process.env.CLAUDE_CODE_TASK_LIST_ID` (`<CLAUDE_CODE_PKG_ROOT>/cli.js:590`)

**Task storage**: Tasks are stored under a `tasks/<sanitizedTaskListId>/` directory, with a lockfile and a max-id ledger.

- Evidence (excerpt): `return i0A(H8(),"tasks",nn(A))` (task directory) (`<CLAUDE_CODE_PKG_ROOT>/cli.js:590`)
- Evidence (excerpt): `return i0A(Lk(A),".lock")` (lock path) (`<CLAUDE_CODE_PKG_ROOT>/cli.js:590`)

**Task states**: `pending | in_progress | completed` is the canonical set.

- Evidence (excerpt): `U.enum(["pending","in_progress","completed"])` (`<CLAUDE_CODE_PKG_ROOT>/cli.js:590`)

**Task “activeForm” (in-progress spinner text)**: Claude Code’s TaskCreate prompt explicitly defines `activeForm` as the present-continuous string shown while a task is `in_progress`, and instructs that `activeForm` should always be provided when creating tasks (even though the schema marks it optional).

- Evidence (excerpt): `**IMPORTANT**: Always provide activeForm` (`<CLAUDE_CODE_PKG_ROOT>/cli.js:2815`)
- Evidence (excerpt): `activeForm:U.string().optional()` (`<CLAUDE_CODE_PKG_ROOT>/cli.js:2823`)

**Status workflow guidance**: Claude Code’s TaskUpdate prompt documents the canonical workflow `pending → in_progress → completed` (and `deleted` as a removal state).

- Evidence (excerpt): `pending\` → \`in_progress\` → \`completed` (`<CLAUDE_CODE_PKG_ROOT>/cli.js:2885`)

### 1.2 Kode alignment (implemented)

Kode implements a Claude-compatible, Kode-first task system with explicit compat boundaries:

- **Write surface (canonical)**: `~/.kode/tasks/<taskListId>/`
- **Read-compat surfaces**: `~/.claude/tasks/<taskListId>/` (and other compat roots), but **never mutate/write** there.

Key code:

- Storage + compat reads: `packages/core/src/tasks/storage.ts`
- Types: `packages/core/src/tasks/types.ts`
- Tool exports: `packages/core/src/utils/taskStorage.ts`

### 1.3 Task tools (implemented)

Tools mirror Claude’s “mini Linear-like” operational shape:

- `TaskCreate` (create)
- `TaskUpdate` (status/fields + dependency edges)
- `TaskList` (summaries)
- `TaskGet` (details)

Tool implementations:

- `packages/tools/src/tools/interaction/TaskCreateTool/TaskCreateTool.tsx`
- `packages/tools/src/tools/interaction/TaskUpdateTool/TaskUpdateTool.tsx`
- `packages/tools/src/tools/interaction/TaskListTool/TaskListTool.tsx`
- `packages/tools/src/tools/interaction/TaskGetTool/TaskGetTool.tsx`

Claude-style result lines are intentionally matched:

- `✔ Task #N created: ...`
- `✔ Task #N updated: status → ...`

### 1.4 Safety boundary: no implicit compat import on mutation (implemented)

Critical correctness rule for Kode-first hygiene:

- Reads may fall back to compat roots.
- **Mutations must only operate in the primary `.kode` store**, otherwise Kode will “accidentally import” legacy tasks.

This is enforced in:

- `packages/core/src/tasks/storage.ts` (mutations use directory-scoped readers, not multi-root readers)

### 1.5 Task reminders (implemented)

Claude Code uses system-level reminders (not to be mentioned to the user). Kode now aligns by:

- Making task reminders first-class (and defaulting legacy todo reminders off).
- Allowing async injection via event (`reminder:inject`) that is drained into the next LLM turn.

Key code:

- `packages/core/src/services/systemReminder/service.ts`
- `packages/core/src/services/systemReminder/events.ts`

## 2) Git checkout / branch switch safety (multi-agent robustness)

### 2.1 Problem

In a shared worktree, a single `git checkout` / `git switch` can invalidate:

- recently read files,
- in-memory assumptions,
- partially applied edits,
- in-flight subagent work.

In multi-agent workflows, this is one of the highest-frequency “silent chaos” sources.

### 2.2 Design principles

- **Bash stays pure Bash**: no policy logic in Bash execution.
- Policy is layered via **hooks/guards** and **observers**.
- Detection must work for:
  - changes initiated by the current agent,
  - changes initiated by other agents,
  - changes initiated by humans.

### 2.3 Kode alignment (implemented)

1. **Workspace presence heartbeat** (per worktree)

- Writes a small presence file under `~/.kode/workspaces/<workspaceKey>/agents/`.
- Enables “are other agents active here?” checks.

2. **PreToolUse guard** (branch-switch blocker)

- Blocks `git switch` and “likely-branch-changing” `git checkout` **when other active peers exist**.
- Escape hatch: `KODE_ALLOW_GIT_BRANCH_SWITCH=1`
- Disable: `KODE_DISABLE_GIT_BRANCH_GUARD=1`

Implemented in:

- Guard: `packages/core/src/hooks/builtin/preToolUse.ts`
- Observation hub: `packages/core/src/services/observationHub.ts`
- Workspace observers (presence + branch): `packages/core/src/services/workspaceSafety.ts`
- Wired into tool pipeline (layered, not in Bash tool): `packages/core/src/engine/pipeline/tool-call.ts`

3. **Branch change observer + system reminder injection**

- Prefer watching `.git/HEAD` (with a polling fallback) and enqueue a `<system-reminder>` if the branch name changes:
  - tell the agent to verify whether work is lost / impacted,
  - continue if low impact,
  - stop + report if medium+ impact.

Implemented in:

- Observation hub: `packages/core/src/services/observationHub.ts`
- `packages/core/src/services/workspaceSafety.ts`
- reminder injection plumbing: `packages/core/src/services/systemReminder/*`

## 3) Context compaction: model-aware + stateful

### 3.1 Problem

Compaction must be based on the **actual active model pointer** (what the user selected), not always `main`. Otherwise:

- small-context models overflow silently,
- compaction triggers too late,
- the system becomes unpredictable.

### 3.2 Claude Code: microcompact (observed)

Claude Code runs a **microcompact pass before autocompact**. This pass:

- Identifies tool results from a specific “heavy tools” set (e.g. Read/Bash/Grep/Glob/LS/Edit/Write).
- Persists old tool result content to disk and replaces it with a short placeholder.
- Emits a `system` boundary marker `subtype: "microcompact_boundary"` with metadata (trigger, preTokens, tokensSaved, compactedToolIds, clearedAttachmentUUIDs).

Evidence (excerpts):

- Boundary marker shape: `subtype:"microcompact_boundary"... microcompactMetadata:{trigger,preTokens,tokensSaved,compactedToolIds,clearedAttachmentUUIDs}` (`<CLAUDE_CODE_PKG_ROOT>/cli.js:3972`)
- Defaults + tool set: `var EL2=20000,kL2=40000,CL2=3... LL2=new Set([...])` (`<CLAUDE_CODE_PKG_ROOT>/cli.js:3308`)

### 3.3 Kode alignment: microcompact (implemented)

Kode now runs a microcompact stage **before** auto-compact:

- Persists selected tool results to session-scoped tool results (`~/.kode/projects/<project>/<session>/tool-results/`) using the Claude-compatible `<persisted-output>...</persisted-output>` placeholder format.
- Keeps the most recent tool results un-compacted (default 3), mirroring Claude’s behavior.
- Emits a short meta boundary message (`<tool-progress>Context microcompacted...</tool-progress>`) that is **excluded from the API payload** (so it doesn’t waste context).

Implemented in:

- Microcompact core: `packages/core/src/utils/microCompactCore.ts`
- Pipeline integration: `packages/core/src/engine/message-pipeline.ts`
- Placeholder persistence: `packages/core/src/utils/toolResultPersistence.ts`
- Meta message filtering: `packages/core/src/engine/messages/api.ts`

### 3.4 Kode alignment: model-aware auto-compaction (implemented)

Auto-compaction now:

- Computes thresholds from `toolUseContext.options.model` (fallback `main`).
- Includes a **Task List Snapshot** inside the compression prompt.
- Includes **Skill/Command** and **MCP** snapshots to preserve workflow continuity.
- Preserves continuity with file recovery and summary-boundary persistence (already existed).

Implemented in:

- `packages/core/src/utils/autoCompactCore.ts`
- Snapshot helpers: `packages/core/src/utils/compactionSnapshots.ts`

### 3.5 Claude Code: PreCompact hook (observed) → Kode parity (implemented)

Claude Code defines a lifecycle hook event `PreCompact` with:

- `trigger: ["manual", "auto"]`
- Exit code semantics:
  - `0`: stdout appended as custom compact instructions
  - `2`: block compaction

Evidence (excerpt): `PreCompact:{... Exit code 0 - stdout appended as custom compact instructions; Exit code 2 - block compaction ... matcherMetadata:{fieldToMatch:"trigger",values:["manual","auto"]}}` (`<CLAUDE_CODE_PKG_ROOT>/cli.js:4637–4640`)

Kode implements this as a hook-layer feature (not embedded in the Bash tool):

- Hook event + registry parsing: `packages/core/src/hooks/types.ts`, `packages/core/src/hooks/registry.ts`
- Hook runner: `packages/core/src/hooks/lifecycle/events.ts`
- Auto compaction integration: `packages/core/src/utils/autoCompactCore.ts`
- Manual `/compact` integration: `apps/cli/src/commands/builtin/compact.ts`

### 3.6 Next alignment targets (not fully implemented yet)

To fully match Claude Code’s “resume + continuity” feel:

- Persist microcompact metadata (tool ids, token usage deltas, tokens saved) to a session-scoped index for forensics/debug (now implemented as `tool-results/microcompact.jsonl`).
- Stronger skill continuity: stable references to _exact_ skill content/version (beyond name + args snapshots).
- MCP “selected resources” snapshot (beyond server + tool usage summaries). Current snapshot now includes `ReadMcpResourceTool` URIs; future work is to capture arbitrary MCP tool “selected resources”.
- More explicit phase model (multi-stage compaction thresholds, e.g. warn → soft compact → hard compact).

## 4) 12 scenario simulations (post-human workflow stress tests)

Each scenario is written as “what happens” → “what the system should do”.

1. **Single-agent, long coding session**: compaction triggers based on selected model; file recovery keeps recent files; task snapshot preserved.
2. **Multi-agent parallel work (separate worktrees)**: branch switches are safe; reminders do not fire unless branch changes unexpectedly.
3. **Multi-agent parallel work (same worktree)**: `git switch` is blocked for safety; system suggests worktree isolation or explicit override.
4. **Human switches branch while agent is thinking**: branch observer injects system reminder on next turn; agent verifies `git status` and re-reads key files.
5. **Agent A updates tasks; Agent B resumes later**: TaskList reads from shared store; reminders show updated task list without user-visible noise.
6. **Legacy `.claude/tasks` exists**: reads fall back to legacy for visibility; mutations require canonical `.kode` tasks (no implicit import).
7. **Detached HEAD / checkout commit**: observer still warns on change; agent verifies build assumptions.
8. **Repo without git**: workspace key falls back to cwd; presence still works; branch observer becomes no-op.
9. **Crash leaves stale presence files**: peer detection uses lastSeen timestamps; stale records decay automatically.
10. **High-churn tasks list (many updates)**: reminder hashing + cache prevents spam; injected reminder queue is bounded.
11. **Compaction immediately after big tool outputs**: summary persists; recovered files appended with token budgets; task snapshot remains included.
12. **MCP-heavy workflow**: compaction includes MCP server/tool snapshots; future enhancement is to persist selected resources for higher-fidelity resume.

## 5) Implementation map (what changed)

- Tasks core: `packages/core/src/tasks/storage.ts`
- Task tools: `packages/tools/src/tools/interaction/Task*Tool/*`
- Tool registry: `packages/tools/src/registry.ts`
- Reminders: `packages/core/src/services/systemReminder/*`
- Workspace safety: `packages/core/src/services/workspaceSafety.ts`
- Observation hub: `packages/core/src/services/observationHub.ts`
- Built-in guard: `packages/core/src/hooks/builtin/preToolUse.ts`
- Microcompact: `packages/core/src/utils/microCompactCore.ts`
- Token estimation: `packages/core/src/utils/tokens.ts`
- Auto-compact: `packages/core/src/utils/autoCompactCore.ts`
- Compaction snapshots: `packages/core/src/utils/compactionSnapshots.ts`
