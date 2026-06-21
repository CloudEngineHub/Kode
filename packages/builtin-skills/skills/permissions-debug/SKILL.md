---
name: permissions-debug
description: Troubleshoot Kode permission prompts/denials (tool allowlists, commandAllowedTools, dontAsk fail-closed, subagent inheritance). Use when tools are unexpectedly blocked, permission prompts repeat, or behavior differs between main agent and subagents.
allowed-tools: SlashCommand Read Grep
---

# Permissions Debug (Kode-first, fail-closed)

## Non-negotiables

- Do not auto-escalate permissions. If an action would normally require user approval, keep it interactive and explain why.
- Prefer **minimal, reversible** permission changes and verify immediately.
- In `dontAsk` contexts, treat “would prompt” as **deny** (fail-closed). Do not try to bypass.

## Fast triage (what to check first)

1. **Confirm what is blocked**
   - Look for the exact tool name and the rejection message.
   - If the failure is from a subagent, confirm whether the parent context was more restricted.

2. **Inspect approved tools / project allowlist**
   - Use `SlashCommand` to run `/approved-tools list` and confirm whether the tool (or its rule category) is present.
   - If the list is unexpectedly long or contains stale entries, remove only the minimum needed with `/approved-tools remove <tool>`.

3. **Check per-command constraints**
   - Some flows apply `commandAllowedTools` constraints (slash command / skill execution contexts). Confirm the command’s `allowed-tools` frontmatter and whether it should be restrictive.

## Verification loop (keep it tight)

- Re-run the exact action that was blocked and confirm:
  - whether the prompt appears (interactive modes), or
  - whether the tool is allowed/denied deterministically (headless / `dontAsk`).

## Forensics (when “it should have worked”)

- Inspect the latest session artifacts under `~/.kode/` (messages + errors) to confirm what tool call was attempted and why it was denied.
- If a background shell was involved, cross-check task output files in `~/.kode/**/tasks/` for the corresponding `bashId`.
