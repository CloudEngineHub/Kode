# Post‑Human Workflows: 12 Stress-Test Scenarios (Unit‑Agent CLI)

This document complements `docs/product/11_post_human_blueprint.md` with **12 concrete scenario simulations**. Each scenario is written as:

- **User intent**
- **Key risks**
- **Ideal low-friction flow** (no hard menus as primary path)
- **Artifacts / state** (what persists + where)
- **Guardrails / recovery**

The goal is not “more features”, but “more predictable outcomes” under messy real-world conditions.

---

## Scenario 1 — Solo deep coding session (large repo, long context)

- **Intent**: “Fix a tricky bug across multiple packages; keep focus for hours.”
- **Risks**: context overflow, lost local assumptions, tool output bloat.
- **Flow**:
  - User: natural language request → agent proposes plan (plan mode) → user approves → tasks created.
  - Auto microcompact persists large tool results; auto-compact summarizes when thresholds are hit based on the **active model pointer**.
- **Artifacts/state**:
  - Tasks: `~/.kode/tasks/<taskListId>/...`
  - Plans: `~/.kode/plans/<slug>.md`
  - Tool-result persistence: project/session scoped output store under `~/.kode/projects/**`.
- **Recovery**: resume session loads the compacted summary boundary + recovers recent file set; tasks remain stable.

## Scenario 2 — Multi-agent parallel work in one repo (shared worktree)

- **Intent**: “Run 2–5 agents in parallel; avoid stepping on each other.”
- **Risks**: branch switches, file edits collision, hidden state invalidation.
- **Flow**:
  - Agent A starts work; agent B starts work.
  - If either tries `git switch` / branch-changing `git checkout`, the pre-tool guard blocks when other active peers exist.
  - If a human switches branch anyway, the branch observer injects a high-priority system reminder into the next turn.
- **Artifacts/state**: workspace presence heartbeat in `~/.kode/workspaces/<workspaceKey>/agents/`.
- **Recovery**: the reminder instructs to verify `git status`, recent edits, and stop/report if medium+ impact.

## Scenario 3 — “Plan mode required” org policy

- **Intent**: “Force planning before execution (compliance / safety / team discipline).”
- **Risks**: users feel blocked; plan becomes ceremonial; bypass loopholes.
- **Flow**:
  - `KODE_PLAN_MODE_REQUIRED=true` gates write/Bash-like operations until a plan is approved.
  - Exit plan mode prompt stays short; Ctrl+G edits the plan file without leaving the flow.
  - Requested permissions are explicit and selectable (prompt-based rules), so the plan approval produces a concrete permission state.
- **Artifacts/state**: plan file + session permission mode context (session-scoped).
- **Recovery**: if plan file missing, the UI offers “exit without plan” vs “keep planning”.

## Scenario 4 — Model switching mid-session (different context windows)

- **Intent**: “Switch from a large-context model to a fast/small model on demand.”
- **Risks**: context overflow after switching; inconsistent compaction timing.
- **Flow**:
  - UI model switch changes the active model pointer.
  - Auto microcompact + auto-compact thresholds use the _selected_ model context window (not always `main`).
- **Artifacts/state**: compaction summary includes `Active Conversation Model` and snapshots (tasks/skills/MCP/plan) so the next turn is stable.
- **Recovery**: if compaction model pointer `compact` doesn’t fit, fallback to `main` for compression is recorded in the boundary notice.

## Scenario 5 — MCP-heavy workflow (auth, failure, reconnect)

- **Intent**: “Use Supabase/GitHub/devtools MCP tools; manage auth and failures quickly.”
- **Risks**: silent auth expiry; stuck ‘failed’ state; unclear source of config.
- **Flow**:
  - `/mcp` shows grouped servers by scope and status.
  - Selecting a server shows config location + auth state + tool counts.
  - Actions are intent-driven: Authenticate / Re-authenticate / Clear auth / Reconnect / Disable.
- **Artifacts/state**: MCP server definitions in primary Kode settings + project MCP files; auth snapshot stored in Kode-first roots.
- **Recovery**: errors point to `kode --debug` logs; reconnect does not require restarting the whole CLI.

## Scenario 6 — Branch change / rebase happens mid-task (human or other agent)

- **Intent**: “Keep executing safely even when the workspace changes underfoot.”
- **Risks**: edits apply to wrong code; tests become meaningless; agent continues on invalid assumptions.
- **Flow**:
  - Observer detects HEAD change and injects system reminder.
  - Agent checks impact; if medium+ impact, stops and reports.
- **Artifacts/state**: reminder event recorded; operator can cross-check with `git reflog` / `git status`.
- **Recovery**: tasks remain; agent can continue after re-validating assumptions.

## Scenario 7 — Long-running background shell + queued prompts

- **Intent**: “Run builds/tests in background; keep sending instructions while it runs.”
- **Risks**: lost output; mis-ordered messages; user confusion about what’s running.
- **Flow**:
  - Backgrounding is explicit and discoverable (e.g. Ctrl+B hint + TaskOutput).
  - Prompt queue allows user to queue additional turns; UI shows queued/pending.
- **Artifacts/state**: background task output stored and incrementally readable; system reminder/notification triggers are deduped.
- **Recovery**: kill/abort produces final tool result with interrupted state.

## Scenario 8 — Safe mode operation (strict permissions, no bypass)

- **Intent**: “Operate in a locked-down environment (prod-like).”
- **Risks**: bypass-permissions foot-guns; hidden writes; tool misuse.
- **Flow**:
  - Safe mode disables bypass permissions paths.
  - Plan exit options adapt (no “bypass” options).
  - Sensitive file writes remain denied even in relaxed modes unless explicitly configured.
- **Artifacts/state**: permission mode state is session-scoped and auditable.
- **Recovery**: permission prompts remain explicit; “dont-ask-again” behavior is scoped and reversible.

## Scenario 9 — Rapid multi-project context switching

- **Intent**: “Jump between 3–10 repos daily; keep each context clean.”
- **Risks**: cross-project leakage; wrong tasks list; wrong MCP project configs.
- **Flow**:
  - Data root resolution is Kode-first per project; legacy roots are read-compat only.
  - Tasks are scoped by taskListId; plans are scoped by conversationKey slug.
- **Artifacts/state**: per-project `.kode` canonical; compat `.claude` is never mutated.
- **Recovery**: resume selector shows stable summaries, not full raw transcripts.

## Scenario 10 — “Agent manages the agent” (capabilities self-bootstrap)

- **Intent**: “Let the agent help me configure itself without an install/setup menu.”
- **Risks**: long onboarding flows; hidden state changes; brittle checks.
- **Flow**:
  - `/capabilities` triggers an audit task that produces concrete actions (e.g. enable sandbox, configure MCP, set statusline).
  - User approves minimal changes; results are verified (build/test/check).
- **Artifacts/state**: settings changes recorded in `.kode` with clear diffs and rollback path.
- **Recovery**: if a capability isn’t available, the agent explains and offers a fallback.

## Scenario 11 — Legacy import + replay (Claude transcripts, configs)

- **Intent**: “Bring existing history/config from legacy surfaces and keep going.”
- **Risks**: accidental legacy writes; partial import; schema drift.
- **Flow**:
  - Kode reads legacy surfaces and migrates into `.kode` when safe.
  - Tool schemas accept compatible legacy fields but keep the canonical storage in `.kode`.
- **Artifacts/state**: imported sessions/logs stored in `.kode`; legacy remains untouched.
- **Recovery**: import failures produce debuggable artifacts and do not corrupt primary stores.

## Scenario 12 — Non-coding “Agent Doing System” task (ops/research/doc)

- **Intent**: “Use the same unit-agent for research, doc synthesis, and operational checklists.”
- **Risks**: context explosion; noisy outputs; lack of audit trail.
- **Flow**:
  - Tasks remain the same primitive: create → in_progress → completed, with evidence outputs attached.
  - Skills provide short, keyword-rich workflows; long references live in `references/`.
- **Artifacts/state**: outputs are stored as artifacts; compaction preserves “what was decided + why”.
- **Recovery**: if network tools are used, permissions remain conservative and failure modes are explicit.

---

## Design invariants validated by these scenarios

- **Plan ↔ Permissions linkage**: plan approval should produce concrete permission state (session-scoped).
- **Observer-driven safety**: branch changes and other workspace hazards should be detected and surfaced via reminders, not buried in tool code.
- **Model-aware compaction**: compaction must be keyed to the active model selection to remain predictable.
- **Kode-first always**: legacy compat is read-only; migrations are explicit and best-effort.
- **No hard menus as the primary path**: overlays exist, but the default path is intent-driven (`/capabilities`, natural language + plan + tasks).
