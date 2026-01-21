# Compatibility (Legacy Formats)

Kode is designed to be **Kode-first** while supporting legacy on-disk layouts (notably the `.claude` layout used by Claude Code).

Kode is **not affiliated with Anthropic**. “Claude Code” is referenced here only to name legacy formats and interoperability.

## Directory Compatibility

- Primary (Kode-native): `./.kode/**`, `~/.kode/**`
- Compatibility (`.claude` layout): `./.claude/**`, `~/.claude/**`

Kode generally **writes to `.kode`** and may read from `.claude` for compatibility.

Note: the interactive `/agents` UI creates new agent files under `.kode/agents` by default, while still loading legacy `.claude/agents`.

## What’s Supported

- Agents
  - Read: `./.kode/agents`, `~/.kode/agents`, `./.claude/agents`, `~/.claude/agents`
  - Write (via `/agents`): `./.kode/agents`, `~/.kode/agents` (edits legacy `.claude/agents` when that’s where the agent currently lives)
- Output styles (`/output-style`)
  - Selection stored in: `./.kode/settings.local.json` (legacy `./.claude/settings.local.json`)
  - Custom styles discovered from: `./.kode/output-styles`, `~/.kode/output-styles`, `./.claude/output-styles`, `~/.claude/output-styles`
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

Legacy variables (supported as fallbacks):

- `CLAUDE_CONFIG_DIR`
- Hook/plugin variables such as `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PROJECT_DIR`, `CLAUDE_ENV_FILE` (used for compatibility with existing plugin/hook scripts).

Some historical `CLAUDE_CODE_*` toggles may still be recognized as fallbacks where needed.

## Helpful CLI Commands

- List configured model profiles/pointers: `kode models list`
- Validate agent templates: `kode agents validate`

## Claude Model Provider Compatibility (Request Profiles)

Some Claude model gateways/proxies enforce a specific **client fingerprint** (headers/UA/system prompt/tools) and may reject third‑party clients even when the API key is valid.

Kode stays **Kode-first** by default and only uses these compatibility profiles:

- when the provider returns a clear “restricted client” signal for a Claude model, or
- when you explicitly choose a request strategy during model setup.

See `docs/claude-model-compatibility.md` for details.
