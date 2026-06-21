# Output Styles

Output styles let you switch the assistant’s _system prompt behavior_ (tone/structure/extra instructions) without changing your project.

Kode implements `/output-style`, including:

- built-in styles (`default`, `Explanatory`, `Learning`)
- custom Markdown style files discovered from user/project/plugin/policy locations
- plugin namespacing (`<plugin>:<style>`)

## Use in the REPL

Open the selection menu:

```text
/output-style
```

Set directly:

```text
/output-style Explanatory
/output-style my-team-style
/output-style my-plugin:strict
```

Show current:

```text
/output-style current
```

Help:

```text
/output-style help
```

Notes:

- Style names are matched case-insensitively.
- Output styles are injected **only for the main thread** (subagents do not receive output styles).

## Built-in Styles

- `default`: no extra output-style prompt (resets to baseline)
- `Explanatory`: adds “Insights” guidance and keeps coding instructions
- `Learning`: adds “Learn by Doing” + “Insights” guidance and keeps coding instructions

## Where the selection is stored

The selected output style is stored per-project in:

- `./.kode/settings.local.json` → `{ "outputStyle": "..." }`

Legacy compatibility:

- If `./.claude/settings.local.json` exists, Kode can read/migrate from it.

If you run with `--setting-sources` that excludes `local`, Kode ignores the saved selection for that session and behaves as `default`.

## Adding custom output styles

Custom styles are Markdown files. The body is appended to the system prompt when the style is active.

### File format

```md
---
name: MyStyle # optional; defaults to filename
description: 'When to use this style' # optional; defaults to first heading/line
keep-coding-instructions: 'true' # optional; MUST be the string "true"/"false"
---

Write any system-prompt instructions here...
```

### Search locations

Custom styles are discovered (and merged by name) from:

1. **Plugins** (namespaced):
   - Plugin root `output-styles/`
   - Plugin manifest `outputStyles` paths (directories or `.md` files)
   - Name becomes `<plugin>:<styleName>`

2. **User styles** (if `--setting-sources` includes `user`):
   - `~/.claude/output-styles/`
   - `~/.kode/output-styles/`
   - `KODE_CONFIG_DIR` overrides the `~/.kode` base; `CLAUDE_CONFIG_DIR` overrides the legacy `~/.claude` base.

3. **Project styles** (if `--setting-sources` includes `project`):
   - `./.claude/output-styles/` (searches up the directory tree)
   - `./.kode/output-styles/` (searches up the directory tree)

4. **Policy-managed styles** (system directory; highest priority):
   - macOS: `/Library/Application Support/ClaudeCode/.claude/output-styles/`
   - Linux: `/etc/claude-code/.claude/output-styles/`
   - Windows: `C:\\Program Files\\ClaudeCode\\.claude\\output-styles\\` (or `C:\\ProgramData\\ClaudeCode\\...`)
