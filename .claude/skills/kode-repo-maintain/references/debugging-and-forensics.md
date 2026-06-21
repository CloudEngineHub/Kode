# Debugging + Forensics (where evidence lives)

Load this when you are debugging:

- “tool didn’t run”
- background task output missing
- unexpected permission denials
- odd session/transcript behavior

## Step 1 — Establish facts (no guessing)

- What was the exact command / UI action?
- Which layer is failing: UI → orchestration → tool → runtime (shell/filesystem/network)?
- Can you reproduce it with a minimal input?

## Step 2 — Inspect persisted artifacts (project-scoped)

Kode persists multiple kinds of artifacts. Two commonly relevant locations:

### A) Log + tool artifacts (messages/errors/tasks)

Under the primary root (default `~/.kode`), keyed by a sanitized project path:

- `~/.kode/<sanitized-cwd>/messages/` (tool calls + results)
- `~/.kode/<sanitized-cwd>/errors/` (error logs)
- `~/.kode/<sanitized-cwd>/tasks/` (`<taskId>.output` background task output)

Example sanitized project key looks like: `-Users-you-path-to-repo`.

Code pointers:

- Log paths: `packages/core/src/logging/log/paths.ts`
- Task output store: `packages/runtime/src/taskOutputStore.ts`

Environment overrides (useful in CI or unusual hosts):

- `KODE_LOG_ROOT` (redirect log root)
- `KODE_LEGACY_CACHE_ROOT` (redirect legacy cache root)

### B) Session protocol logs (jsonl)

Session logs are stored separately:

- `~/.kode/projects/<sanitized-cwd>/<sessionId>.jsonl`
- `~/.kode/projects/<sanitized-cwd>/agent-<agentId>.jsonl`

This is useful when you need the raw transcript/protocol envelope.

Code pointers:

- Session log storage: `packages/protocol/src/utils/kodeAgentSessionLog.ts`

## Step 3 — Known high-signal dumps

- Bash intent gate failures are dumped under:
  - `~/.kode/<sanitized-cwd>/errors/bash-llm-gate/*.txt`

Code pointers:

- Dump writer: `packages/tools/src/tools/system/BashTool/llmSafetyGateDump.ts`

## Step 4 — Fix loop

1. Reproduce → capture evidence path(s)
2. Make the smallest fix
3. Re-run the minimal reproducer
4. Expand to `bun test` / `bun run typecheck` only after the local repro passes
