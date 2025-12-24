# Compatibility (Claude Code)

Kode is designed to be **Kode-first** while remaining compatible with parts of the **Claude Code** project ecosystem.

Kode is **not affiliated with Anthropic**. “Claude Code” is referenced here only to describe on-disk formats and interoperability.

## Directory Compatibility

- Primary (Kode-native): `./.kode/**`, `~/.kode/**`
- Legacy (Claude Code-compatible, read-first fallback): `./.claude/**`, `~/.claude/**`

Kode generally **writes to `.kode`** and may read from `.claude` for compatibility.

## What’s Supported

- Agents
  - Primary: `./.kode/agents`, `~/.kode/agents`
  - Legacy: `./.claude/agents`, `~/.claude/agents`
- Custom commands & skills
  - Primary: `./.kode/commands`, `~/.kode/commands`, `./.kode/skills`, `~/.kode/skills`
  - Legacy: `./.claude/commands`, `~/.claude/commands`, `./.claude/skills`, `~/.claude/skills`
- Plugins / marketplaces
  - Primary: `./.kode-plugin/**`
  - Legacy: `./.claude-plugin/**`
- Legacy instruction file
  - `CLAUDE.md` is treated as a legacy instructions file when present.

## Environment Variables (Compatibility)

Kode’s preferred variables:
- `KODE_CONFIG_DIR`

Claude Code-compatible variables (supported as fallbacks):
- `CLAUDE_CONFIG_DIR`
- Hook/plugin variables such as `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PROJECT_DIR`, `CLAUDE_ENV_FILE` (used for compatibility with existing plugin/hook scripts).

Some historical `CLAUDE_CODE_*` toggles may still be recognized as fallbacks where needed.

