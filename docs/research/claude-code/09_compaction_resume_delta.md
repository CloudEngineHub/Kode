# Compaction + Resume delta (Claude Code evidence → Kode alignment)

This note captures **evidence-backed** Claude Code behaviors related to compaction/resume and the specific parity gaps we closed in Kode (with code+tests).

## Official evidence anchors (Claude Code CHANGELOG)

All citations below reference the line-numbered mirror at:

- `docs/research/reference/changelog.lines.md`

Key compaction/resume anchors:

- Auto-compaction exists and is user-toggleable: `docs/research/reference/changelog.lines.md:1327`
  - “Automatic conversation compaction for infinite conversation length (toggle with /config)”
- Auto-compaction performance work: `docs/research/reference/changelog.lines.md:305`
  - “Made auto-compacting instant”
- Resume/continue exists: `docs/research/reference/changelog.lines.md:1243`
  - “Resume conversations … with "claude --continue" and "claude --resume"”
- Compaction boundaries exist and are relied on for correctness: `docs/research/reference/changelog.lines.md:501`
  - “Fixed issue causing `/compact` to fail with `prompt_too_long` by making it respect existing compact boundaries”

## Kode baseline (before this change)

- Kode had:
  - Manual `/compact`: `apps/cli/src/commands/builtin/compact.ts`
  - Auto-compaction hook: `packages/core/src/utils/autoCompactCore.ts` (invoked from `packages/core/src/engine/message-pipeline.ts`)
  - Session persistence in JSONL: `packages/protocol/src/utils/kodeAgentSessionLog.ts` + load/resume helpers under `packages/protocol/src/utils/`
- Parity gaps found:
  - **Auto-compaction dropped the in-flight user prompt** because it summarized the full `messages` array and returned only the summary, losing the pending last user message.
  - **Auto-compaction cleared the UI transcript to empty** (`getMessagesSetter()([])`) but did not replace it with the compacted summary context, creating a mismatch between what the model saw vs what the user saw.
  - Session log readers already supported `summary` records, but Kode was not writing them in the compaction flows, so resume metadata frequently stayed empty.
  - Resume/continue loaded the full session transcript even after compaction events, which conflicts with the “compact boundaries” expectation from the changelog evidence.

## What changed in Kode (implemented parity improvements)

### 1) Auto-compaction preserves the pending user message and replaces the visible transcript

- `packages/core/src/utils/autoCompactCore.ts`
  - Auto-compaction now compresses **history** (everything except the pending last user message) and then re-attaches the pending user message, preventing the user prompt from being dropped.
  - In interactive mode, the transcript is replaced with the new compressed context via `getMessagesSetter()(compactedMessages)` instead of clearing to empty.

### 2) Compaction boundaries are persisted to session logs (best-effort)

- Auto-compaction persistence:
  - `packages/core/src/utils/autoCompactCore.ts` now appends:
    - the compact notice + summary messages, and
    - a `summary` record via `appendSessionSummaryRecord()`
- Manual `/compact` persistence:
  - `apps/cli/src/commands/builtin/compact.ts` now appends:
    - the compact intro + summary messages, and
    - a `summary` record via `appendSessionSummaryRecord()`

### 3) Resume/continue uses the most recent compaction boundary by default

- `packages/protocol/src/utils/kodeAgentSessionLoad.ts`
  - Added `lastSummaryLeafUuid` tracking in `loadKodeAgentSessionLogData()`.
  - Added `loadKodeAgentSessionMessagesForResume()` which trims the resumed transcript to the most recent summary boundary (keeping up to two preceding user messages so the resumed segment stays coherent).
- Wired resume flows to the trimmed loader:
  - `apps/cli/src/entrypoints/cli/cliParser/rootAction.ts` (`--continue` / `--resume`)
  - `apps/cli/src/ui/screens/ResumeConversation.tsx`
  - `apps/cli/src/commands/debug/resume.tsx`

## Tests added/updated

- `packages/core/src/test/unit/session-load.test.ts`
  - Fixed invalid UUID fixtures (RFC 4122 variant bits) and corrected summary map expectations.
  - Added coverage for `loadKodeAgentSessionMessagesForResume()` trimming behavior (including the “keep up to two preceding user messages” heuristic).
- `packages/core/src/test/unit/session-resume-discovery.test.ts`
  - Fixed invalid UUID fixtures so session discovery tests reflect real session IDs.
- `packages/protocol/src/test/unit/kodeAgentSessionImport.test.ts` + `packages/protocol/src/test/fixtures/claude-session-basic.jsonl`
  - Fixed invalid UUID fixtures so imported sessions load deterministically.

## Known limitations / follow-ups

- “Auto-compacting instant” in the changelog is a performance claim; Kode’s compaction still requires an LLM call. Future parity work could explore background pre-summarization or other non-blocking UX improvements, but that requires more evidence from official behavior (beyond CHANGELOG statements).
