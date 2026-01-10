# Agent Templates (Examples)

This folder contains example agent templates for Kode subagents.

Kode loads agents from these locations (user + project):
- `./.kode/agents/` and `~/.kode/agents/`
- `./.claude/agents/` and `~/.claude/agents/` (compatibility layout)

To try these templates:
1. Create `./.kode/agents/` (or `./.claude/agents/`).
2. Copy one or more files from this folder into it.
3. Run `kode`, then open `/agents` to confirm they were loaded.

This repository intentionally keeps `.kode/` and `.claude/` out of version control (they’re local runtime/config folders).

