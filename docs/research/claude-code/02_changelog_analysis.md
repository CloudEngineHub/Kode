# Claude Code CHANGELOG — evidence digest

- Source file: `<CLAUDE_CODE_ROOT>/CHANGELOG.md`
- Source SHA256: `b5c77a8786080c274b6386bfb607870009ee5a66059d82774d1fd0a44093aa58`
- Parsed versions: `184`

> Note: All quoted bullet items below are extracted verbatim from the changelog.

## 2.1.x Parity Checklist (UX + safety, official bullets only)

This section is a **curated must-align subset** for the current official evidence set (`@anthropic-ai/claude-code@2.1.6`). Every line below is quoted verbatim from the changelog.

### 2.1.6 (selected)

> - Added automatic discovery of skills from nested `.claude/skills` directories when working with files in subdirectories
> - Added `context_window.used_percentage` and `context_window.remaining_percentage` fields to status line input for easier context window display
> - Fixed permission bypass via shell line continuation that could allow blocked commands to execute
> - Fixed numpad keys outputting escape sequences instead of characters in Kitty keyboard protocol terminals
> - Fixed Option+Return not inserting newlines in Kitty keyboard protocol terminals
> - Fixed `mcp list` and `mcp get` commands leaving orphaned MCP server processes
> - Changed terminal title to "Claude Code" on startup for better window identification

### 2.1.4 (selected)

> - Added `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` environment variable to disable all background task functionality including auto-backgrounding and the Ctrl+B shortcut

### 2.1.3 (selected)

> - Merged slash commands and skills, simplifying the mental model with no change in behavior
> - Added detection and warnings for unreachable permission rules, with warnings in `/doctor` and after saving rules that include the source of each rule and actionable fix guidance
> - Fixed plan files persisting across `/clear` commands, now ensuring a fresh plan file is used after clearing a conversation
> - Fixed trust dialog acceptance when running from the home directory not enabling trust-requiring features like hooks during the session
> - Changed tool hook execution timeout from 60 seconds to 10 minutes

### 2.1.2 (selected)

> - Added Shift+Tab keyboard shortcut in plan mode to quickly select "auto-accept edits" option
> - Fixed a command injection vulnerability in bash command processing where malformed input could execute arbitrary commands
> - Changed large bash command outputs to be saved to disk instead of truncated, allowing Claude to read the full content
> - Changed large tool outputs to be persisted to disk instead of truncated, providing full output access via file references

### 2.1.0 (selected)

> - Changed Shift+Enter to work out of the box in iTerm2, WezTerm, Ghostty, and Kitty without modifying terminal configs
> - Fixed Esc key with queued prompts to only move them to input without canceling the running task
> - Added unified Ctrl+B backgrounding for both bash commands and agents - pressing Ctrl+B now backgrounds all running foreground tasks simultaneously
> - Added support for MCP `list_changed` notifications, allowing MCP servers to dynamically update their available tools, prompts, and resources without requiring reconnection
> - Fixed multi-line bash commands with backslash continuations being incorrectly split and flagged for permissions

## Timeline (version -> change counts)

| version   | bullets | Added | Fixed | Improved | Changed | Removed | Updated | Merged | Bracketed | Other |
| --------- | ------: | ----: | ----: | -------: | ------: | ------: | ------: | -----: | --------: | ----: |
| `2.1.6`   |      25 |     6 |    11 |        3 |       2 |       1 |       1 |      0 |         1 |     0 |
| `2.1.5`   |       1 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.1.4`   |       2 |     1 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.1.3`   |      13 |     2 |     6 |        2 |       1 |       0 |       0 |      1 |         1 |     0 |
| `2.1.2`   |      22 |     6 |     7 |        3 |       3 |       0 |       0 |      0 |         2 |     1 |
| `2.1.0`   |     109 |    26 |    51 |       19 |       2 |       2 |       1 |      0 |         6 |     2 |
| `2.0.76`  |       1 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.75`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.74`  |      13 |     5 |     5 |        1 |       0 |       0 |       0 |      0 |         2 |     0 |
| `2.0.73`  |       9 |     4 |     1 |        3 |       0 |       0 |       0 |      0 |         1 |     0 |
| `2.0.72`  |      10 |     3 |     2 |        3 |       1 |       0 |       0 |      0 |         0 |     1 |
| `2.0.71`  |       7 |     2 |     3 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `2.0.70`  |      12 |     4 |     3 |        2 |       0 |       1 |       0 |      0 |         0 |     2 |
| `2.0.69`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.68`  |       6 |     0 |     4 |        1 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.67`  |      11 |     1 |     6 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `2.0.65`  |       6 |     4 |     2 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.64`  |      14 |     3 |     2 |        1 |       0 |       0 |       0 |      0 |         0 |     8 |
| `2.0.62`  |       7 |     2 |     5 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.61`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.60`  |       6 |     3 |     0 |        0 |       0 |       0 |       1 |      0 |         0 |     2 |
| `2.0.59`  |       3 |     2 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.58`  |       3 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `2.0.57`  |       2 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.56`  |       2 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.55`  |       4 |     0 |     2 |        2 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.54`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `2.0.52`  |       4 |     0 |     3 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.51`  |       9 |     1 |     2 |        0 |       0 |       0 |       0 |      0 |         0 |     6 |
| `2.0.50`  |       4 |     0 |     1 |        2 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.49`  |       3 |     1 |     1 |        1 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.47`  |       4 |     0 |     2 |        2 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.46`  |       1 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.45`  |       3 |     2 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.43`  |       8 |     4 |     4 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.42`  |       1 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.41`  |      12 |     1 |     6 |        0 |       0 |       0 |       0 |      0 |         0 |     5 |
| `2.0.37`  |       3 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `2.0.36`  |       3 |     0 |     3 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.35`  |       5 |     1 |     1 |        1 |       0 |       0 |       0 |      0 |         0 |     2 |
| `2.0.34`  |       4 |     0 |     2 |        1 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.33`  |       3 |     0 |     2 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.32`  |       3 |     1 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.31`  |       6 |     0 |     3 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `2.0.30`  |      16 |     4 |     7 |        0 |       0 |       1 |       0 |      0 |         0 |     4 |
| `2.0.28`  |       9 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     8 |
| `2.0.27`  |       5 |     1 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `2.0.25`  |       1 |     0 |     0 |        0 |       0 |       1 |       0 |      0 |         0 |     0 |
| `2.0.24`  |       4 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `2.0.22`  |       4 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `2.0.21`  |       5 |     2 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `2.0.20`  |       1 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.19`  |       2 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.17`  |       6 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     5 |
| `2.0.15`  |       2 |     0 |     2 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.14`  |       7 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     7 |
| `2.0.13`  |       1 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `2.0.12`  |      11 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |    11 |
| `2.0.11`  |       4 |     0 |     2 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `2.0.10`  |       6 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     5 |
| `2.0.9`   |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `2.0.8`   |       5 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     5 |
| `2.0.5`   |       4 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `2.0.1`   |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `2.0.0`   |      10 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |    10 |
| `1.0.126` |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.124` |       5 |     0 |     1 |        1 |       0 |       0 |       0 |      0 |         0 |     3 |
| `1.0.123` |       7 |     1 |     3 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `1.0.120` |       5 |     0 |     2 |        1 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.119` |       4 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.117` |       5 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     5 |
| `1.0.115` |       6 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     6 |
| `1.0.113` |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.112` |       5 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.111` |       2 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.110` |       3 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.109` |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.106` |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.97`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.94`  |       4 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `1.0.93`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.90`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.88`  |       5 |     0 |     2 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `1.0.86`  |       3 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.85`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.84`  |       4 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.83`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.82`  |       5 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     5 |
| `1.0.81`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.80`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.77`  |       4 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.73`  |       5 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     5 |
| `1.0.72`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.71`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.70`  |       3 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.69`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.68`  |       7 |     1 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     5 |
| `1.0.65`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.64`  |       5 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.63`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.62`  |       4 |     1 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.61`  |       8 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     7 |
| `1.0.60`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.59`  |       5 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.58`  |       3 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.57`  |       3 |     1 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.56`  |       3 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `1.0.55`  |       4 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.54`  |       5 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     5 |
| `1.0.53`  |       2 |     0 |     0 |        0 |       0 |       0 |       1 |      0 |         0 |     1 |
| `1.0.52`  |       1 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `1.0.51`  |       9 |     2 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     6 |
| `1.0.48`  |       7 |     2 |     1 |        1 |       0 |       0 |       0 |      0 |         0 |     3 |
| `1.0.45`  |       6 |     0 |     1 |        0 |       0 |       0 |       1 |      0 |         0 |     4 |
| `1.0.44`  |       4 |     0 |     0 |        0 |       1 |       0 |       0 |      0 |         0 |     3 |
| `1.0.43`  |       2 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.42`  |       1 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `1.0.41`  |       5 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.40`  |       1 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `1.0.39`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.38`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.37`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.36`  |       2 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.35`  |       1 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `1.0.34`  |       1 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `1.0.33`  |       3 |     1 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.32`  |       2 |     1 |     0 |        0 |       0 |       0 |       1 |      0 |         0 |     0 |
| `1.0.31`  |       1 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `1.0.30`  |       4 |     1 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.29`  |       1 |     0 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     0 |
| `1.0.28`  |       5 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.27`  |       4 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.25`  |       4 |     0 |     0 |        2 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.24`  |       2 |     0 |     1 |        1 |       0 |       0 |       0 |      0 |         0 |     0 |
| `1.0.23`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `1.0.22`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.21`  |       3 |     0 |     1 |        1 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.18`  |       8 |     5 |     1 |        1 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.17`  |       4 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `1.0.11`  |       5 |     1 |     0 |        3 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.10`  |       2 |     1 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     0 |
| `1.0.8`   |       6 |     1 |     3 |        1 |       0 |       0 |       0 |      0 |         0 |     1 |
| `1.0.7`   |       6 |     0 |     1 |        1 |       0 |       0 |       0 |      0 |         0 |     4 |
| `1.0.6`   |       5 |     1 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     3 |
| `1.0.4`   |       1 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `1.0.1`   |       3 |     1 |     0 |        1 |       0 |       0 |       1 |      0 |         0 |     0 |
| `1.0.0`   |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.125` |       2 |     0 |     0 |        0 |       0 |       1 |       0 |      0 |         0 |     1 |
| `0.2.117` |       4 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `0.2.108` |       6 |     0 |     2 |        0 |       0 |       0 |       0 |      0 |         0 |     4 |
| `0.2.107` |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.106` |       2 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.105` |       4 |     1 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.102` |       3 |     0 |     0 |        2 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.100` |       2 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.98`  |       1 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `0.2.96`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.93`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.82`  |       2 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.75`  |       5 |     0 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     4 |
| `0.2.74`  |       2 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.72`  |       1 |     0 |     0 |        0 |       0 |       0 |       1 |      0 |         0 |     0 |
| `0.2.70`  |       3 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `0.2.69`  |       2 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.67`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.66`  |       2 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.63`  |       1 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     0 |
| `0.2.61`  |       3 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.59`  |       3 |     0 |     0 |        1 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.54`  |       3 |     1 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.53`  |       2 |     0 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.50`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.49`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.47`  |       3 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `0.2.44`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.41`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.37`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.36`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.34`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.32`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.31`  |       2 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     2 |
| `0.2.30`  |       3 |     1 |     1 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |
| `0.2.26`  |       3 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     3 |
| `0.2.21`  |       1 |     0 |     0 |        0 |       0 |       0 |       0 |      0 |         0 |     1 |

## Topic Index (cross-version, keyword-based)

> These indices are heuristic keyword matches for navigation; the authoritative record remains the per-version verbatim extraction.

### 重大 UX/交互变更 (heuristic)

- `2.1.6` — Added automatic discovery of skills from nested `.claude/skills` directories when working with files in subdirectories
- `2.1.6` — Added `context_window.used_percentage` and `context_window.remaining_percentage` fields to status line input for easier context window display
- `2.1.6` — Fixed rate limit options menu incorrectly auto-opening when resuming a previous session
- `2.1.6` — Fixed numpad keys outputting escape sequences instead of characters in Kitty keyboard protocol terminals
- `2.1.6` — Fixed Option+Return not inserting newlines in Kitty keyboard protocol terminals
- `2.1.6` — Fixed visual artifacts in ink2 mode when nodes become hidden via `display:none`
- `2.1.6` — Improved the external CLAUDE.md imports approval dialog to show which files are being imported and from where
- `2.1.6` — Improved the `/tasks` dialog to go directly to task details when there's only one background task running
- `2.1.6` — Improved @ autocomplete with icons for different suggestion types and single-line formatting
- `2.1.6` — Changed task notification display to cap at 3 lines with overflow summary when multiple background tasks complete simultaneously
- `2.1.6` — Changed terminal title to "Claude Code" on startup for better window identification
- `2.1.6` — Removed ability to @-mention MCP servers to enable/disable - use `/mcp enable <name>` instead
- `2.1.3` — Merged slash commands and skills, simplifying the mental model with no change in behavior
- `2.1.3` — Fixed mismatch between background task count in status bar and items shown in tasks dialog
- `2.1.3` — Fixed trust dialog acceptance when running from the home directory not enabling trust-requiring features like hooks during the session
- `2.1.3` — Improved terminal rendering stability by preventing uncontrolled writes from corrupting cursor state
- `2.1.3` — Improved slash command suggestion readability by truncating long descriptions to 2 lines
- `2.1.3` — Changed tool hook execution timeout from 60 seconds to 10 minutes
- `2.1.2` — Added source path metadata to images dragged onto the terminal, helping Claude understand where images originated
- `2.1.2` — Added clickable hyperlinks for file paths in tool output in terminals that support OSC 8 (like iTerm)
- `2.1.2` — Added Shift+Tab keyboard shortcut in plan mode to quickly select "auto-accept edits" option
- `2.1.2` — Improved Option-as-Meta hint on macOS to show terminal-specific instructions for native CSIu terminals like iTerm2, Kitty, and WezTerm
- `2.1.2` — Changed large bash command outputs to be saved to disk instead of truncated, allowing Claude to read the full content
- `2.1.2` — Changed large tool outputs to be persisted to disk instead of truncated, providing full output access via file references
- `2.1.2` — Changed `/plugins` installed tab to unify plugins and MCPs with scope-based grouping
- `2.1.2` — [SDK] Changed minimum zod peer dependency to ^4.0.0
- `2.1.0` — Added automatic skill hot-reload - skills created or modified in `~/.claude/skills` or `.claude/skills` are now immediately available without restarting the session
- `2.1.0` — Added support for running skills and slash commands in a forked sub-agent context using `context: fork` in skill frontmatter
- `2.1.0` — Added support for `agent` field in skills to specify agent type for execution
- `2.1.0` — Changed Shift+Enter to work out of the box in iTerm2, WezTerm, Ghostty, and Kitty without modifying terminal configs
- `2.1.0` — Fixed files and skills not being properly discovered when resuming sessions with `-c` or `--resume`
- `2.1.0` — Added `/teleport` and `/remote-env` slash commands for claude.ai subscribers, allowing them to resume and configure remote sessions
- `2.1.0` — Added hooks support for skill and slash command frontmatter
- `2.1.0` — Added `/plan` command shortcut to enable plan mode directly from the prompt
- `2.1.0` — Added slash command autocomplete support when `/` appears anywhere in input, not just at the beginning
- `2.1.0` — Added left/right arrow key navigation for cycling through tabs in dialogs
- `2.1.0` — Added real-time thinking block display in Ctrl+O transcript mode
- `2.1.0` — Added filepath to full output in background bash task details dialog
- `2.1.0` — Added Skills as a separate category in the context visualization
- `2.1.0` — Fixed a hang when reading FIFO files by skipping symlink resolution for special file types
- `2.1.0` — Fixed terminal keyboard mode not being reset on exit in Ghostty, iTerm2, Kitty, and WezTerm
- `2.1.0` — Fixed slash commands passed as CLI arguments (e.g., `claude /context`) not being executed properly
- `2.1.0` — Fixed pressing Enter after Tab-completing a slash command selecting a different command instead of submitting the completed one
- `2.1.0` — Fixed slash command argument hint flickering and inconsistent display when typing commands with arguments
- `2.1.0` — Fixed Claude sometimes redundantly invoking the Skill tool when running slash commands directly
- `2.1.0` — Fixed forked slash commands showing "AbortError" instead of "Interrupted" message when cancelled
- `2.1.0` — Fixed cursor disappearing after dismissing permission dialogs
- `2.1.0` — Fixed `/hooks` menu selecting wrong hook type when scrolling to a different option
- `2.1.0` — Fixed ultrathink keyword highlighting being applied to wrong characters when user prompt text wraps to multiple lines
- `2.1.0` — Fixed collapsed "Reading X files…" indicator incorrectly switching to past tense when thinking blocks appear mid-stream
- `2.1.0` — Improved terminal rendering performance when using native installer or Bun, especially for text with emoji, ANSI codes, and Unicode characters
- `2.1.0` — Improved skills to show progress while executing, displaying tool uses as they happen
- `2.1.0` — Improved skills from `/skills/` directories to be visible in the slash command menu by default (opt-out with `user-invocable: false` in frontmatter)
- `2.1.0` — Improved skill suggestions to prioritize recently and frequently used skills
- `2.1.0` — Changed "Interrupted" message color from red to grey for a less alarming appearance
- `2.1.0` — Removed permission prompt when entering plan mode - users can now enter plan mode without approval
- `2.1.0` — Removed underline styling from image reference links
- `2.1.0` — [SDK] Changed minimum zod peer dependency to ^4.0.0
- `2.1.0` — [VSCode] Added currently selected model name to the context menu
- `2.0.74` — Added `/terminal-setup` support for Kitty, Alacritty, Zed, and Warp terminals
- `2.0.74` — Added guidance for macOS users when Alt shortcuts fail due to terminal configuration
- `2.0.74` — Fixed macOS keyboard shortcuts to display 'opt' instead of 'alt'
- `2.0.74` — Improved `/context` command visualization with grouped skills and agents by source, slash commands, and sorted token count
- `2.0.73` — Added clickable `[Image #N]` links that open attached images in the default viewer
- `2.0.72` — Reduced terminal flickering
- `2.0.72` — Changed thinking toggle from Tab to Alt+T to avoid accidental triggers
- `2.0.70` — Added `current_usage` field to status line input, enabling accurate context window percentage calculations
- `2.0.70` — Fixed diff view not updating when terminal is resized
- `2.0.70` — Removed # shortcut for quick memory entry (tell Claude to edit your CLAUDE.md instead)
- `2.0.70` — Fix thinking mode toggle in /config not persisting correctly
- `2.0.70` — Improve UI for file creation permission dialog
- `2.0.68` — Improved plan mode exit UX: show simplified yes/no dialog when exiting with empty or missing plan instead of throwing an error
- `2.0.67` — Thinking mode is now enabled by default for Opus 4.5
- `2.0.67` — Thinking mode configuration has moved to /config
- `2.0.67` — Added search functionality to `/permissions` command with `/` keyboard shortcut for filtering rules by tool name
- `2.0.65` — Added context window information to status line input
- `2.0.64` — Added named session support: use `/rename` to name sessions, `/resume <name>` in REPL or `claude --resume <name>` from the terminal to resume them
- `2.0.64` — Improved `/resume` screen with grouped forked sessions and keyboard shortcuts for preview (P) and rename (R)
- `2.0.62` — Fixed duplicate slash commands appearing when ~/.claude is symlinked to a project directory
- `2.0.62` — Fixed slash command selection not working when multiple commands share the same name
- `2.0.62` — Fixed an issue where skill files inside symlinked skill directories could become circular symlinks
- `2.0.62` — Fixed running versions getting removed because lock file incorrectly going stale
- `2.0.61` — Reverted VSCode support for multiple terminal clients due to responsiveness issues.
- `2.0.60` — Added --disable-slash-commands CLI flag to disable all slash commands
- `2.0.60` — VSCode: Added support for multiple terminal clients connecting to the IDE server simultaneously
- `2.0.58` — Windows: Managed settings now prefer `C:\Program Files\ClaudeCode` if it exists. Support for `C:\ProgramData\ClaudeCode` will be removed in a future version.
- `2.0.56` — Added setting to enable/disable terminal progress bar (OSC 9;4)
- `2.0.55` — Fixed keyboard navigation becoming unresponsive when holding down arrow keys in memory location selector
- `2.0.51` — Plan Mode now builds more precise plans and executes more thoroughly
- `2.0.51` — Fixed handling of thinking errors
- `2.0.50` — Improved ultrathink text display
- `2.0.43` — Added skills frontmatter field to declare skills to auto-load for subagents
- `2.0.41` — Fixed slash commands from user settings being loaded twice, which could cause rendering issues
- `2.0.41` — Fixed broken security documentation links in trust dialogs and onboarding
- `2.0.41` — ctrl-r history search landing on a slash command no longer cancels the search
- `2.0.35` — Fixed menu navigation getting stuck on items with empty string or other falsy values (e.g., in the `/hooks` menu)
- `2.0.33` — Fixed `claude doctor` incorrectly detecting Homebrew vs npm-global installations by properly resolving symlinks
- `2.0.30` — Removed support for custom ripgrep configuration, resolving an issue where Search returns no results and config discovery fails
- `2.0.30` — Fixed a bug where `/context` would sometimes fail with "max_tokens must be greater than thinking.budget_tokens" error message
- `2.0.28` — Plan mode: introduced new Plan subagent
- `2.0.28` — Discovery of custom slash commands, subagents, and output styles no longer respects .gitignore
- `2.0.28` — Stop `/terminal-setup` from adding backslash to `Shift + Enter` in VS Code
- `2.0.25` — Removed legacy SDK entrypoint. Please migrate to @anthropic-ai/claude-agent-sdk for future SDK updates: https://platform.claude.com/docs/en/agent-sdk/migration-guide
- `2.0.24` — Fixed a bug where project-level skills were not loading when --setting-sources 'project' was specified
- `2.0.22` — Fixed content layout shift when scrolling through slash commands
- `2.0.22` — IDE: Add toggle to enable/disable thinking.
- `2.0.21` — Claude will now ask you questions more often in plan mode
- `2.0.20` — Added support for Claude Skills
- `2.0.17` — Haiku 4.5 automatically uses Sonnet in plan mode, and Haiku for execution (i.e. SonnetPlan by default)
- `2.0.14` — Fix ultrathink + thinking toggle
- `2.0.11` — IDE: Fixed keyboard shortcuts and focus issues for smoother interaction
- `2.0.10` — Rewrote terminal renderer for buttery smooth UI
- `2.0.8` — /context: Fix counting for thinking blocks
- `2.0.8` — Improve message rendering for users with light themes on dark terminals
- `2.0.5` — IDE: Add "Open in Terminal" link in login screen
- `2.0.0` — Tab to toggle thinking (sticky across sessions)
- `1.0.123` — Fixed thinking mode triggering on negation phrases like "don't think"
- `1.0.123` — Added SlashCommand tool, which enables Claude to invoke your slash commands. https://code.claude.com/docs/en/slash-commands#SlashCommand-tool
- `1.0.123` — Fixed a bug where resuming a conversation in headless mode would sometimes enable thinking unnecessarily
- `1.0.120` — Improved VSCode extension command registry and sessions dialog user experience
- `1.0.120` — Enhanced sessions dialog responsiveness and visual feedback
- `1.0.119` — Fix thinking mode not working in headless sessions
- `1.0.119` — Fix slash commands now properly update allowed tools instead of replacing them
- `1.0.115` — Improve thinking mode display with enhanced visual effects
- `1.0.115` — Type /t to temporarily disable thinking mode in your prompt
- `1.0.115` — Improve UI consistency for permission request dialogs
- `1.0.110` — /terminal-setup command now supports WezTerm
- `1.0.88` — Status line input now includes `exceeds_200k_tokens`
- `1.0.85` — Status line input now includes session cost info
- `1.0.84` — @-mention: Add ~/.claude/\* files to suggestions for easier agent, output style, and slash command editing
- `1.0.82` — SDK: New additionalDirectories option to search custom paths, improved slash command processing
- `1.0.77` — Opus Plan Mode: New setting in `/model` to run Opus only in plan mode, Sonnet otherwise
- `1.0.73` — UI: Enhanced spinner animations and status line visual hierarchy
- `1.0.71` — Customizable status line: add your terminal prompt to Claude Code with /statusline
- `1.0.70` — Added support for @-mentions in slash command arguments
- `1.0.63` — Windows: Fixed file search, @agent mentions, and custom slash commands functionality
- `1.0.61` — Transcript mode (Ctrl+R): Changed Esc to exit transcript mode rather than interrupt
- `1.0.61` — Settings: Fixed resolution of settings files paths that are symlinks
- `1.0.61` — Slash commands: Fixed permissions checking for allowed-tools with Bash
- `1.0.57` — Added support for specifying a model in slash commands
- `1.0.57` — Fix: Remove trailing newlines from bash output in terminal wrapping
- `1.0.56` — Windows: Enabled shift+tab for mode switching on versions of Node.js that support terminal VT mode
- `1.0.54` — Custom slash commands: Added argument-hint to frontmatter
- `1.0.54` — Windows: mode switching now uses alt + m, and plan mode renders properly
- `1.0.51` — Custom slash commands: Fixed user-level commands in subdirectories
- `1.0.51` — Plan mode: Fixed issue where rejected plan from sub-task would get discarded
- `1.0.45` — Custom slash commands: Restored namespacing in command names based on subdirectories. For example, .claude/commands/frontend/component.md is now /frontend:component, not /component.
- `1.0.44` — MCP: resource_link tool results are now supported
- `1.0.44` — MCP: tool annotations and tool titles now display in /mcp view
- `1.0.44` — Changed Ctrl+Z to suspend Claude Code. Resume by running `fg`. Prompt input undo is now Ctrl+U.
- `1.0.33` — Improvements to plan mode
- `1.0.30` — Custom slash commands: Run bash output, @-mention files, enable thinking with thinking keywords
- `1.0.30` — Improved file path autocomplete with filename matching
- `1.0.28` — Slash commands: Fix selector display during history navigation
- `1.0.28` — New attributes (terminal.type, language) in OpenTelemetry logging
- `1.0.27` — /resume slash command to switch conversations within Claude Code
- `1.0.25` — Slash commands: moved "project" and "user" prefixes to descriptions
- `1.0.25` — Slash commands: improved reliability for command discovery
- `1.0.18` — Fixed issue where pasted content was lost when dialogs appeared
- `1.0.17` — Update Claude Code process title to display "claude" instead of "node"
- `1.0.8` — Added support for triggering thinking non-English languages
- `1.0.6` — Added support for symlinks in @file typeahead
- `1.0.1` — Added `DISABLE_INTERLEAVED_THINKING` to give users the option to opt out of interleaved thinking.
- `1.0.1` — Updated documentation links and OAuth process descriptions
- `0.2.125` — Removed `DEBUG=true` in favor of `ANTHROPIC_LOG=debug`, to log all requests
- `0.2.108` — Fixed a bug where thinking was not working in -p mode
- `0.2.102` — Improved thinking triggering reliability
- `0.2.69` — Enhanced terminal output display with better text truncation logic
- `0.2.61` — Navigate menus with vim-style keys (j/k) or bash/emacs shortcuts (Ctrl+n/p) for faster interaction
- `0.2.44` — Ask Claude to make a plan with thinking mode: just say 'think' or 'think harder' or even 'ultrathink'
- `0.2.31` — Custom slash commands: Markdown files in .claude/commands/ directories now appear as custom slash commands to insert prompts into your conversation
- `0.2.30` — Added ANSI color theme for better terminal compatibility
- `0.2.30` — Fixed issue where slash command arguments weren't being sent properly
- `0.2.26` — Fuzzy matching for slash commands

### 工具/权限相关变更 (heuristic)

- `2.1.6` — Fixed permission bypass via shell line continuation that could allow blocked commands to execute
- `2.1.6` — Improved the external CLAUDE.md imports approval dialog to show which files are being imported and from where
- `2.1.3` — Added detection and warnings for unreachable permission rules, with warnings in `/doctor` and after saving rules that include the source of each rule and actionable fix guidance
- `2.1.3` — Fixed trust dialog acceptance when running from the home directory not enabling trust-requiring features like hooks during the session
- `2.1.3` — [VSCode] Added clickable destination selector for permission requests, allowing you to choose where settings are saved (this project, all projects, shared with team, or session only)
- `2.1.2` — Fixed a command injection vulnerability in bash command processing where malformed input could execute arbitrary commands
- `2.1.2` — Improved permission explainer to not flag routine dev workflows (git fetch/rebase, npm install, tests, PRs) as medium risk
- `2.1.0` — Reduced permission prompts for complex bash commands
- `2.1.0` — Fixed PreToolUse hooks to allow `updatedInput` when returning `ask` permission decision, enabling hooks to act as middleware while still requesting user consent
- `2.1.0` — Added wildcard pattern matching for Bash tool permissions using `*` at any position in rules (e.g., `Bash(npm *)`, `Bash(* install)`, `Bash(git * main)`)
- `2.1.0` — Added support for disabling specific agents using `Task(AgentName)` syntax in settings.json permissions or the `--disallowedTools` CLI flag
- `2.1.0` — Added support for YAML-style lists in frontmatter `allowed-tools` field for cleaner skill declarations
- `2.1.0` — Fixed AWS Bedrock subagents not inheriting EU/APAC cross-region inference model configuration, causing 403 errors when IAM permissions are scoped to specific regions
- `2.1.0` — Fixed `${CLAUDE_PLUGIN_ROOT}` not being substituted in plugin `allowed-tools` frontmatter, which caused tools to incorrectly require approval
- `2.1.0` — Fixed files created by the Write tool using hardcoded 0o600 permissions instead of respecting the system umask
- `2.1.0` — Fixed multi-line bash commands with backslash continuations being incorrectly split and flagged for permissions
- `2.1.0` — Fixed bash command prefix extraction to correctly identify subcommands after global options (e.g., `git -C /path log` now correctly matches `Bash(git log:*)` rules)
- `2.1.0` — Fixed duplicate Bash commands appearing in permission request option labels
- `2.1.0` — Fixed cursor disappearing after dismissing permission dialogs
- `2.1.0` — Improved subagents (Task tool) to continue working after permission denial, allowing them to try alternative approaches
- `2.1.0` — Improved permission prompt UX with Tab hint moved to footer, cleaner Yes/No input labels with contextual placeholders
- `2.1.0` — Removed permission prompt when entering plan mode - users can now enter plan mode without approval
- `2.1.0` — [VSCode] Added descriptive labels on auto-accept permission button (e.g., "Yes, allow npm for this project" instead of "Yes, and don't ask again")
- `2.0.74` — Fixed skill `allowed-tools` not being applied to tools invoked by the skill
- `2.0.73` — Improved search UX across resume session, permissions, and plugins screens with a unified SearchBox component
- `2.0.73` — [VSCode] Added tab icon badges showing pending permissions (blue) and unread completions (orange)
- `2.0.71` — Fixed MCP servers from `.mcp.json` not loading when using `--dangerously-skip-permissions`
- `2.0.71` — Fixed permission rules incorrectly rejecting valid bash commands containing shell glob patterns (e.g., `ls *.txt`, `for f in *.png`)
- `2.0.70` — Added wildcard syntax `mcp__server__*` for MCP tool permissions to allow or deny all tools from a server
- `2.0.70` — Improve UI for file creation permission dialog
- `2.0.67` — Added search functionality to `/permissions` command with `/` keyboard shortcut for filtering rules by tool name
- `2.0.67` — Fixed scroll position resetting after deleting a permission rule in `/permissions`
- `2.0.67` — Fixed `claude install --force` not bypassing stale lock files
- `2.0.64` — Added support for .claude/rules/`. See https://code.claude.com/docs/en/memory for details.
- `2.0.54` — Hooks: Enable PermissionRequest hooks to process 'always allow' suggestions and apply permission updates
- `2.0.49` — Fixed handling of subagent permissions
- `2.0.45` — Added `PermissionRequest` hook to automatically approve or deny tool permission requests with custom logic
- `2.0.43` — Added `permissionMode` field for custom agents
- `2.0.41` — Fixed broken security documentation links in trust dialogs and onboarding
- `2.0.41` — Allow more safe git commands to run without approval
- `2.0.35` — Migrated `ignorePatterns` from project config to deny permissions in the localSettings.
- `2.0.34` — VSCode Extension: Added setting to configure the initial permission mode for new conversations
- `2.0.30` — Fixed bug that saved session permissions to local settings
- `2.0.30` — Fixed hooks and plugins not executing when using --dangerously-skip-permissions flag
- `2.0.28` — Fixed a bug where macOS permission prompts would show up upon initial launch when launching from home directory
- `2.0.27` — New UI for permission prompts
- `2.0.22` — Fix bug causing duplicate permission prompts with parallel tool calls
- `2.0.14` — Improve permission checks for bash with inline env vars
- `2.0.10` — Fixes for bash permission checks with environment variables in the command
- `1.0.124` — No longer inform Claude of the list of allowed tools when permission is denied
- `1.0.124` — Fixed security vulnerability in Bash tool permission checks
- `1.0.123` — Bash permission rules now support output redirections when matching (e.g., `Bash(python:*)` matches `python script.py > output.txt`)
- `1.0.120` — Fixed security vulnerability where Bash tool permission checks could be bypassed using prefix matching
- `1.0.117` — Add permissions management hint to /add-dir output
- `1.0.115` — Improve UI consistency for permission request dialogs
- `1.0.106` — Windows: Fixed path permission matching to consistently use POSIX format (e.g., `Read(//c/Users/...)`)
- `1.0.97` — Settings: /doctor now validates permission rule syntax and suggests corrections
- `1.0.93` — Support NO_PROXY environment variable to bypass proxy for specified hostnames and IPs
- `1.0.77` — SDK: Add session support and permission denial tracking
- `1.0.72` — Ask permissions: have Claude Code always ask for confirmation to use specific tools with /permissions
- `1.0.68` — Windows: improve permissions checks for allow / deny tools and project trust. This may create a new project entry in `.claude.json` - manually merge the history field if desired.
- `1.0.61` — Slash commands: Fixed permissions checking for allowed-tools with Bash
- `1.0.59` — Hooks: Exposed PermissionDecision to hooks (including "ask")
- `1.0.57` — Improved permission messages to help Claude understand allowed tools
- `1.0.32` — Added forceLoginMethod setting to bypass login selection screen
- `1.0.18` — MCP authentication and permission improvements
- `1.0.8` — Fixed a regression where search tools unnecessarily asked for permissions
- `1.0.7` — Renamed /allowed-tools -> /permissions
- `1.0.7` — Fixed a bug where --dangerously-skip-permissions sometimes didn't work in --print mode
- `1.0.6` — Reduced unnecessary tool permission prompts
- `0.2.106` — Fixed a bug where MCP permission prompt didn't always show correctly
- `0.2.67` — Shared project permission rules can be saved in .claude/settings.json
- `0.2.26` — New /approved-tools command for managing tool permissions

### 存储/会话/恢复相关变更 (heuristic)

- `2.1.6` — Fixed rate limit options menu incorrectly auto-opening when resuming a previous session
- `2.1.6` — Fixed corrupted config backup files accumulating in the home directory (now only one backup is created per config file)
- `2.1.3` — Fixed plan files persisting across `/clear` commands, now ensuring a fresh plan file is used after clearing a conversation
- `2.1.3` — Fixed sub-agents using the wrong model during conversation compaction
- `2.1.3` — Fixed trust dialog acceptance when running from the home directory not enabling trust-requiring features like hooks during the session
- `2.1.3` — [VSCode] Added clickable destination selector for permission requests, allowing you to choose where settings are saved (this project, all projects, shared with team, or session only)
- `2.1.2` — Added `agent_type` to SessionStart hook input, populated if `--agent` is specified
- `2.1.2` — Fixed a memory leak where tree-sitter parse trees were not being freed, causing WASM memory to grow unbounded over long sessions
- `2.1.2` — Fixed remote session URL and teleport being broken when using `/tasks` command
- `2.1.2` — Changed large tool outputs to be persisted to disk instead of truncated, providing full output access via file references
- `2.1.0` — Added automatic skill hot-reload - skills created or modified in `~/.claude/skills` or `.claude/skills` are now immediately available without restarting the session
- `2.1.0` — Added `IS_DEMO` environment variable to hide email and organization from the UI, useful for streaming or recording sessions
- `2.1.0` — Fixed files and skills not being properly discovered when resuming sessions with `-c` or `--resume`
- `2.1.0` — Added `/teleport` and `/remote-env` slash commands for claude.ai subscribers, allowing them to resume and configure remote sessions
- `2.1.0` — Added `--tools` flag support in interactive mode to restrict which built-in tools Claude can use during interactive sessions
- `2.1.0` — Fixed session persistence getting stuck after transient server errors by recovering from 409 conflicts when the entry was actually stored
- `2.1.0` — Fixed session resume failures caused by orphaned tool results during concurrent tool execution
- `2.1.0` — Improved compaction reliability
- `2.1.0` — Improved the Claude in Chrome notification with shortened help text and persistent display until dismissed
- `2.0.73` — Added support for custom session IDs when forking sessions with `--session-id` combined with `--resume` or `--continue` and `--fork-session`
- `2.0.73` — Improved search UX across resume session, permissions, and plugins screens with a unified SearchBox component
- `2.0.72` — Added loading indicator when resuming conversations for better feedback
- `2.0.70` — Improved memory usage by 3x for large conversations
- `2.0.70` — Fix thinking mode toggle in /config not persisting correctly
- `2.0.64` — Added named session support: use `/rename` to name sessions, `/resume <name>` in REPL or `claude --resume <name>` from the terminal to resume them
- `2.0.64` — Fixed `--system-prompt` being ignored when using `--continue` or `--resume` flags
- `2.0.64` — Improved `/resume` screen with grouped forked sessions and keyboard shortcuts for preview (P) and rename (R)
- `2.0.59` — Added --agent CLI flag to override the agent setting for the current session
- `2.0.50` — Improved clarity of 5-hour session limit warning message
- `2.0.41` — Teleporting a session from web will automatically set the upstream branch
- `2.0.34` — VSCode Extension: Added setting to configure the initial permission mode for new conversations
- `2.0.30` — Fixed bug that saved session permissions to local settings
- `2.0.28` — Subagents: claude can now choose to resume subagents
- `2.0.28` — Fixed a bug where macOS permission prompts would show up upon initial launch when launching from home directory
- `2.0.27` — Added current branch filtering and search to session resume screen for easier navigation
- `2.0.27` — VSCode Extension: Bug fixes for unrelated 'Warmup' conversations, and configuration/settings occasionally being reset to defaults
- `2.0.12` — Avoid mentioning hooks in `/resume` summaries
- `2.0.12` — Changes to the "verbose" setting in `/config` now persist across sessions
- `2.0.0` — /rewind a conversation to undo code changes
- `2.0.0` — Tab to toggle thinking (sticky across sessions)
- `1.0.123` — Fixed a bug where resuming a conversation in headless mode would sometimes enable thinking unnecessarily
- `1.0.120` — Improved VSCode extension command registry and sessions dialog user experience
- `1.0.120` — Enhanced sessions dialog responsiveness and visual feedback
- `1.0.119` — Fix thinking mode not working in headless sessions
- `1.0.112` — Hooks: Added systemMessage support for SessionEnd hooks
- `1.0.85` — Status line input now includes session cost info
- `1.0.85` — Hooks: Introduced SessionEnd hook
- `1.0.77` — SDK: Add session support and permission denial tracking
- `1.0.77` — Fix token limit errors in conversation summarization
- `1.0.64` — SDK: Fixed user input tracking across multi-turn conversations
- `1.0.62` — Hooks: Added SessionStart hook for new session initialization
- `1.0.44` — New /export command lets you quickly export a conversation for sharing
- `1.0.44` — Changed Ctrl+Z to suspend Claude Code. Resume by running `fg`. Prompt input undo is now Ctrl+U.
- `1.0.33` — Improved logging functionality with session ID support
- `1.0.27` — /resume slash command to switch conversations within Claude Code
- `1.0.18` — Improved startup performance and session storage performance
- `1.0.11` — Improved todo list handling during compaction
- `0.2.100` — Made db storage optional; missing db support disables --continue and --resume
- `0.2.93` — Resume conversations from where you left off from with "claude --continue" and "claude --resume"
- `0.2.61` — Fixed an issue where ESC key could crash the conversation history selector
- `0.2.47` — Automatic conversation compaction for infinite conversation length (toggle with /config)
- `0.2.32` — Fix for some PersistentShell issues
- `0.2.31` — Custom slash commands: Markdown files in .claude/commands/ directories now appear as custom slash commands to insert prompts into your conversation

### WASM/渲染/解析相关变更 (heuristic)

- `2.1.3` — Improved terminal rendering stability by preventing uncontrolled writes from corrupting cursor state
- `2.1.2` — Fixed a memory leak where tree-sitter parse trees were not being freed, causing WASM memory to grow unbounded over long sessions
- `2.1.0` — Fixed commands with `$()` command substitution failing with parse errors
- `2.1.0` — Fixed memory leak in git diff parsing where sliced strings retained large parent strings
- `2.1.0` — Improved terminal rendering performance when using native installer or Bun, especially for text with emoji, ANSI codes, and Unicode characters
- `2.1.0` — Improved sed in-place edit commands to render as file edits with diff preview
- `2.1.0` — [VSCode] Fixed paragraph breaks not rendering in markdown content
- `2.1.0` — [Windows] Fixed issue with improper rendering
- `2.0.74` — [Windows] Fixed issue with improper rendering
- `2.0.67` — Fixed consecutive @~/ file references in CLAUDE.md being incorrectly parsed due to markdown strikethrough interference
- `2.0.43` — Fixed duplicate rendering of some messages in the UI
- `2.0.41` — Fixed slash commands from user settings being loaded twice, which could cause rendering issues
- `2.0.14` — Several improvements to rendering
- `2.0.10` — Rewrote terminal renderer for buttery smooth UI
- `2.0.8` — Improve message rendering for users with light themes on dark terminals
- `1.0.123` — Fixed rendering performance degradation during token streaming
- `1.0.80` — UI improvements: Fix text contrast for custom subagent colors and spinner rendering issues
- `1.0.70` — Performance: Optimized message rendering for better performance with large contexts
- `1.0.54` — Windows: mode switching now uses alt + m, and plan mode renders properly
- `1.0.34` — Fixed a memory leak causing a MaxListenersExceededWarning message to appear
- `1.0.29` — Improved CJK character support in cursor navigation and rendering
- `1.0.4` — Fixed a bug where MCP tool errors weren't being parsed correctly

## Full Per-Version Extraction (verbatim)

### 2.1.6

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.1.6`)
- Bullets: `25`

> - Added search functionality to `/config` command for quickly filtering settings
> - Added Updates section to `/doctor` showing auto-update channel and available npm versions (stable/latest)
> - Added date range filtering to `/stats` command - press `r` to cycle between Last 7 days, Last 30 days, and All time
> - Added automatic discovery of skills from nested `.claude/skills` directories when working with files in subdirectories
> - Added `context_window.used_percentage` and `context_window.remaining_percentage` fields to status line input for easier context window display
> - Added an error display when the editor fails during Ctrl+G
> - Fixed permission bypass via shell line continuation that could allow blocked commands to execute
> - Fixed false "File has been unexpectedly modified" errors when file watchers touch files without changing content
> - Fixed text styling (bold, colors) getting progressively misaligned in multi-line responses
> - Fixed the feedback panel closing unexpectedly when typing 'n' in the description field
> - Fixed rate limit warning appearing at low usage after weekly reset (now requires 70% usage)
> - Fixed rate limit options menu incorrectly auto-opening when resuming a previous session
> - Fixed numpad keys outputting escape sequences instead of characters in Kitty keyboard protocol terminals
> - Fixed Option+Return not inserting newlines in Kitty keyboard protocol terminals
> - Fixed corrupted config backup files accumulating in the home directory (now only one backup is created per config file)
> - Fixed `mcp list` and `mcp get` commands leaving orphaned MCP server processes
> - Fixed visual artifacts in ink2 mode when nodes become hidden via `display:none`
> - Improved the external CLAUDE.md imports approval dialog to show which files are being imported and from where
> - Improved the `/tasks` dialog to go directly to task details when there's only one background task running
> - Improved @ autocomplete with icons for different suggestion types and single-line formatting
> - Updated "Help improve Claude" setting fetch to refresh OAuth and retry when it fails due to a stale OAuth token
> - Changed task notification display to cap at 3 lines with overflow summary when multiple background tasks complete simultaneously
> - Changed terminal title to "Claude Code" on startup for better window identification
> - Removed ability to @-mention MCP servers to enable/disable - use `/mcp enable <name>` instead
> - [VSCode] Fixed usage indicator not updating after manual compact

### 2.1.5

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.1.5`)
- Bullets: `1`

> - Added `CLAUDE_CODE_TMPDIR` environment variable to override the temp directory used for internal temp files, useful for environments with custom temp directory requirements

### 2.1.4

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.1.4`)
- Bullets: `2`

> - Added `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` environment variable to disable all background task functionality including auto-backgrounding and the Ctrl+B shortcut
> - Fixed "Help improve Claude" setting fetch to refresh OAuth and retry when it fails due to a stale OAuth token

### 2.1.3

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.1.3`)
- Bullets: `13`

> - Merged slash commands and skills, simplifying the mental model with no change in behavior
> - Added release channel (`stable` or `latest`) toggle to `/config`
> - Added detection and warnings for unreachable permission rules, with warnings in `/doctor` and after saving rules that include the source of each rule and actionable fix guidance
> - Fixed plan files persisting across `/clear` commands, now ensuring a fresh plan file is used after clearing a conversation
> - Fixed false skill duplicate detection on filesystems with large inodes (e.g., ExFAT) by using 64-bit precision for inode values
> - Fixed mismatch between background task count in status bar and items shown in tasks dialog
> - Fixed sub-agents using the wrong model during conversation compaction
> - Fixed web search in sub-agents using incorrect model
> - Fixed trust dialog acceptance when running from the home directory not enabling trust-requiring features like hooks during the session
> - Improved terminal rendering stability by preventing uncontrolled writes from corrupting cursor state
> - Improved slash command suggestion readability by truncating long descriptions to 2 lines
> - Changed tool hook execution timeout from 60 seconds to 10 minutes
> - [VSCode] Added clickable destination selector for permission requests, allowing you to choose where settings are saved (this project, all projects, shared with team, or session only)

### 2.1.2

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.1.2`)
- Bullets: `22`

> - Added source path metadata to images dragged onto the terminal, helping Claude understand where images originated
> - Added clickable hyperlinks for file paths in tool output in terminals that support OSC 8 (like iTerm)
> - Added support for Windows Package Manager (winget) installations with automatic detection and update instructions
> - Added Shift+Tab keyboard shortcut in plan mode to quickly select "auto-accept edits" option
> - Added `FORCE_AUTOUPDATE_PLUGINS` environment variable to allow plugin autoupdate even when the main auto-updater is disabled
> - Added `agent_type` to SessionStart hook input, populated if `--agent` is specified
> - Fixed a command injection vulnerability in bash command processing where malformed input could execute arbitrary commands
> - Fixed a memory leak where tree-sitter parse trees were not being freed, causing WASM memory to grow unbounded over long sessions
> - Fixed binary files (images, PDFs, etc.) being accidentally included in memory when using `@include` directives in CLAUDE.md files
> - Fixed updates incorrectly claiming another installation is in progress
> - Fixed crash when socket files exist in watched directories (defense-in-depth for EOPNOTSUPP errors)
> - Fixed remote session URL and teleport being broken when using `/tasks` command
> - Fixed MCP tool names being exposed in analytics events by sanitizing user-specific server configurations
> - Improved Option-as-Meta hint on macOS to show terminal-specific instructions for native CSIu terminals like iTerm2, Kitty, and WezTerm
> - Improved error message when pasting images over SSH to suggest using `scp` instead of the unhelpful clipboard shortcut hint
> - Improved permission explainer to not flag routine dev workflows (git fetch/rebase, npm install, tests, PRs) as medium risk
> - Changed large bash command outputs to be saved to disk instead of truncated, allowing Claude to read the full content
> - Changed large tool outputs to be persisted to disk instead of truncated, providing full output access via file references
> - Changed `/plugins` installed tab to unify plugins and MCPs with scope-based grouping
> - Deprecated Windows managed settings path `C:\ProgramData\ClaudeCode\managed-settings.json` - administrators should migrate to `C:\Program Files\ClaudeCode\managed-settings.json`
> - [SDK] Changed minimum zod peer dependency to ^4.0.0
> - [VSCode] Fixed usage display not updating after manual compact

### 2.1.0

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.1.0`)
- Bullets: `109`

> - Added automatic skill hot-reload - skills created or modified in `~/.claude/skills` or `.claude/skills` are now immediately available without restarting the session
> - Added support for running skills and slash commands in a forked sub-agent context using `context: fork` in skill frontmatter
> - Added support for `agent` field in skills to specify agent type for execution
> - Added `language` setting to configure Claude's response language (e.g., language: "japanese")
> - Changed Shift+Enter to work out of the box in iTerm2, WezTerm, Ghostty, and Kitty without modifying terminal configs
> - Added `respectGitignore` support in `settings.json` for per-project control over @-mention file picker behavior
> - Added `IS_DEMO` environment variable to hide email and organization from the UI, useful for streaming or recording sessions
> - Fixed security issue where sensitive data (OAuth tokens, API keys, passwords) could be exposed in debug logs
> - Fixed files and skills not being properly discovered when resuming sessions with `-c` or `--resume`
> - Fixed pasted content being lost when replaying prompts from history using up arrow or Ctrl+R search
> - Fixed Esc key with queued prompts to only move them to input without canceling the running task
> - Reduced permission prompts for complex bash commands
> - Fixed command search to prioritize exact and prefix matches on command names over fuzzy matches in descriptions
> - Fixed PreToolUse hooks to allow `updatedInput` when returning `ask` permission decision, enabling hooks to act as middleware while still requesting user consent
> - Fixed plugin path resolution for file-based marketplace sources
> - Fixed LSP tool being incorrectly enabled when no LSP servers were configured
> - Fixed background tasks failing with "git repository not found" error for repositories with dots in their names
> - Fixed Claude in Chrome support for WSL environments
> - Fixed Windows native installer silently failing when executable creation fails
> - Improved CLI help output to display options and subcommands in alphabetical order for easier navigation
> - Added wildcard pattern matching for Bash tool permissions using `*` at any position in rules (e.g., `Bash(npm *)`, `Bash(* install)`, `Bash(git * main)`)
> - Added unified Ctrl+B backgrounding for both bash commands and agents - pressing Ctrl+B now backgrounds all running foreground tasks simultaneously
> - Added support for MCP `list_changed` notifications, allowing MCP servers to dynamically update their available tools, prompts, and resources without requiring reconnection
> - Added `/teleport` and `/remote-env` slash commands for claude.ai subscribers, allowing them to resume and configure remote sessions
> - Added support for disabling specific agents using `Task(AgentName)` syntax in settings.json permissions or the `--disallowedTools` CLI flag
> - Added hooks support to agent frontmatter, allowing agents to define PreToolUse, PostToolUse, and Stop hooks scoped to the agent's lifecycle
> - Added hooks support for skill and slash command frontmatter
> - Added new Vim motions: `;` and `,` to repeat f/F/t/T motions, `y` operator for yank with `yy`/`Y`, `p`/`P` for paste, text objects (`iw`, `aw`, `iW`, `aW`, `i"`, `a"`, `i'`, `a'`, `i(`, `a(`, `i[`, `a[`, `i{`, `a{`), `>>` and `<<` for indent/dedent, and `J` to join lines
> - Added `/plan` command shortcut to enable plan mode directly from the prompt
> - Added slash command autocomplete support when `/` appears anywhere in input, not just at the beginning
> - Added `--tools` flag support in interactive mode to restrict which built-in tools Claude can use during interactive sessions
> - Added `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` environment variable to override the default file read token limit
> - Added support for `once: true` config for hooks
> - Added support for YAML-style lists in frontmatter `allowed-tools` field for cleaner skill declarations
> - Added support for prompt and agent hook types from plugins (previously only command hooks were supported)
> - Added Cmd+V support for image paste in iTerm2 (maps to Ctrl+V)
> - Added left/right arrow key navigation for cycling through tabs in dialogs
> - Added real-time thinking block display in Ctrl+O transcript mode
> - Added filepath to full output in background bash task details dialog
> - Added Skills as a separate category in the context visualization
> - Fixed OAuth token refresh not triggering when server reports token expired but local expiration check disagrees
> - Fixed session persistence getting stuck after transient server errors by recovering from 409 conflicts when the entry was actually stored
> - Fixed session resume failures caused by orphaned tool results during concurrent tool execution
> - Fixed a race condition where stale OAuth tokens could be read from the keychain cache during concurrent token refresh attempts
> - Fixed AWS Bedrock subagents not inheriting EU/APAC cross-region inference model configuration, causing 403 errors when IAM permissions are scoped to specific regions
> - Fixed API context overflow when background tasks produce large output by truncating to 30K chars with file path reference
> - Fixed a hang when reading FIFO files by skipping symlink resolution for special file types
> - Fixed terminal keyboard mode not being reset on exit in Ghostty, iTerm2, Kitty, and WezTerm
> - Fixed Alt+B and Alt+F (word navigation) not working in iTerm2, Ghostty, Kitty, and WezTerm
> - Fixed `${CLAUDE_PLUGIN_ROOT}` not being substituted in plugin `allowed-tools` frontmatter, which caused tools to incorrectly require approval
> - Fixed files created by the Write tool using hardcoded 0o600 permissions instead of respecting the system umask
> - Fixed commands with `$()` command substitution failing with parse errors
> - Fixed multi-line bash commands with backslash continuations being incorrectly split and flagged for permissions
> - Fixed bash command prefix extraction to correctly identify subcommands after global options (e.g., `git -C /path log` now correctly matches `Bash(git log:*)` rules)
> - Fixed slash commands passed as CLI arguments (e.g., `claude /context`) not being executed properly
> - Fixed pressing Enter after Tab-completing a slash command selecting a different command instead of submitting the completed one
> - Fixed slash command argument hint flickering and inconsistent display when typing commands with arguments
> - Fixed Claude sometimes redundantly invoking the Skill tool when running slash commands directly
> - Fixed skill token estimates in `/context` to accurately reflect frontmatter-only loading
> - Fixed subagents sometimes not inheriting the parent's model by default
> - Fixed model picker showing incorrect selection for Bedrock/Vertex users using `--model haiku`
> - Fixed duplicate Bash commands appearing in permission request option labels
> - Fixed noisy output when background tasks complete - now shows clean completion message instead of raw output
> - Fixed background task completion notifications to appear proactively with bullet point
> - Fixed forked slash commands showing "AbortError" instead of "Interrupted" message when cancelled
> - Fixed cursor disappearing after dismissing permission dialogs
> - Fixed `/hooks` menu selecting wrong hook type when scrolling to a different option
> - Fixed images in queued prompts showing as "[object Object]" when pressing Esc to cancel
> - Fixed images being silently dropped when queueing messages while backgrounding a task
> - Fixed large pasted images failing with "Image was too large" error
> - Fixed extra blank lines in multiline prompts containing CJK characters (Japanese, Chinese, Korean)
> - Fixed ultrathink keyword highlighting being applied to wrong characters when user prompt text wraps to multiple lines
> - Fixed collapsed "Reading X files…" indicator incorrectly switching to past tense when thinking blocks appear mid-stream
> - Fixed Bash read commands (like `ls` and `cat`) not being counted in collapsed read/search groups, causing groups to incorrectly show "Read 0 files"
> - Fixed spinner token counter to properly accumulate tokens from subagents during execution
> - Fixed memory leak in git diff parsing where sliced strings retained large parent strings
> - Fixed race condition where LSP tool could return "no server available" during startup
> - Fixed feedback submission hanging indefinitely when network requests timeout
> - Fixed search mode in plugin discovery and log selector views exiting when pressing up arrow
> - Fixed hook success message showing trailing colon when hook has no output
> - Multiple optimizations to improve startup performance
> - Improved terminal rendering performance when using native installer or Bun, especially for text with emoji, ANSI codes, and Unicode characters
> - Improved performance when reading Jupyter notebooks with many cells
> - Improved reliability for piped input like `cat refactor.md | claude`
> - Improved reliability for AskQuestion tool
> - Improved sed in-place edit commands to render as file edits with diff preview
> - Improved Claude to automatically continue when response is cut off due to output token limit, instead of showing an error message
> - Improved compaction reliability
> - Improved subagents (Task tool) to continue working after permission denial, allowing them to try alternative approaches
> - Improved skills to show progress while executing, displaying tool uses as they happen
> - Improved skills from `/skills/` directories to be visible in the slash command menu by default (opt-out with `user-invocable: false` in frontmatter)
> - Improved skill suggestions to prioritize recently and frequently used skills
> - Improved spinner feedback when waiting for the first response token
> - Improved token count display in spinner to include tokens from background agents
> - Improved incremental output for async agents to give the main thread more control and visibility
> - Improved permission prompt UX with Tab hint moved to footer, cleaner Yes/No input labels with contextual placeholders
> - Improved the Claude in Chrome notification with shortened help text and persistent display until dismissed
> - Improved macOS screenshot paste reliability with TIFF format support
> - Improved `/stats` output
> - Updated Atlassian MCP integration to use a more reliable default configuration (streamable HTTP)
> - Changed "Interrupted" message color from red to grey for a less alarming appearance
> - Removed permission prompt when entering plan mode - users can now enter plan mode without approval
> - Removed underline styling from image reference links
> - [SDK] Changed minimum zod peer dependency to ^4.0.0
> - [VSCode] Added currently selected model name to the context menu
> - [VSCode] Added descriptive labels on auto-accept permission button (e.g., "Yes, allow npm for this project" instead of "Yes, and don't ask again")
> - [VSCode] Fixed paragraph breaks not rendering in markdown content
> - [VSCode] Fixed scrolling in the extension inadvertently scrolling the parent iframe
> - [Windows] Fixed issue with improper rendering

### 2.0.76

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.76`)
- Bullets: `1`

> - Fixed issue with macOS code-sign warning when using Claude in Chrome integration

### 2.0.75

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.75`)
- Bullets: `1`

> - Minor bugfixes

### 2.0.74

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.74`)
- Bullets: `13`

> - Added LSP (Language Server Protocol) tool for code intelligence features like go-to-definition, find references, and hover documentation
> - Added `/terminal-setup` support for Kitty, Alacritty, Zed, and Warp terminals
> - Added ctrl+t shortcut in `/theme` to toggle syntax highlighting on/off
> - Added syntax highlighting info to theme picker
> - Added guidance for macOS users when Alt shortcuts fail due to terminal configuration
> - Fixed skill `allowed-tools` not being applied to tools invoked by the skill
> - Fixed Opus 4.5 tip incorrectly showing when user was already using Opus
> - Fixed a potential crash when syntax highlighting isn't initialized correctly
> - Fixed visual bug in `/plugins discover` where list selection indicator showed while search box was focused
> - Fixed macOS keyboard shortcuts to display 'opt' instead of 'alt'
> - Improved `/context` command visualization with grouped skills and agents by source, slash commands, and sorted token count
> - [Windows] Fixed issue with improper rendering
> - [VSCode] Added gift tag pictogram for year-end promotion message

### 2.0.73

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.73`)
- Bullets: `9`

> - Added clickable `[Image #N]` links that open attached images in the default viewer
> - Added alt-y yank-pop to cycle through kill ring history after ctrl-y yank
> - Added search filtering to the plugin discover screen (type to filter by name, description, or marketplace)
> - Added support for custom session IDs when forking sessions with `--session-id` combined with `--resume` or `--continue` and `--fork-session`
> - Fixed slow input history cycling and race condition that could overwrite text after message submission
> - Improved `/theme` command to open theme picker directly
> - Improved theme picker UI
> - Improved search UX across resume session, permissions, and plugins screens with a unified SearchBox component
> - [VSCode] Added tab icon badges showing pending permissions (blue) and unread completions (orange)

### 2.0.72

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.72`)
- Bullets: `10`

> - Added Claude in Chrome (Beta) feature that works with the Chrome extension (https://claude.ai/chrome) to let you control your browser directly from Claude Code
> - Reduced terminal flickering
> - Added scannable QR code to mobile app tip for quick app downloads
> - Added loading indicator when resuming conversations for better feedback
> - Fixed `/context` command not respecting custom system prompts in non-interactive mode
> - Fixed order of consecutive Ctrl+K lines when pasting with Ctrl+Y
> - Improved @ mention file suggestion speed (~3x faster in git repositories)
> - Improved file suggestion performance in repos with `.ignore` or `.rgignore` files
> - Improved settings validation errors to be more prominent
> - Changed thinking toggle from Tab to Alt+T to avoid accidental triggers

### 2.0.71

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.71`)
- Bullets: `7`

> - Added /config toggle to enable/disable prompt suggestions
> - Added `/settings` as an alias for the `/config` command
> - Fixed @ file reference suggestions incorrectly triggering when cursor is in the middle of a path
> - Fixed MCP servers from `.mcp.json` not loading when using `--dangerously-skip-permissions`
> - Fixed permission rules incorrectly rejecting valid bash commands containing shell glob patterns (e.g., `ls *.txt`, `for f in *.png`)
> - Bedrock: Environment variable `ANTHROPIC_BEDROCK_BASE_URL` is now respected for token counting and inference profile listing
> - New syntax highlighting engine for native build

### 2.0.70

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.70`)
- Bullets: `12`

> - Added Enter key to accept and submit prompt suggestions immediately (tab still accepts for editing)
> - Added wildcard syntax `mcp__server__*` for MCP tool permissions to allow or deny all tools from a server
> - Added auto-update toggle for plugin marketplaces, allowing per-marketplace control over automatic updates
> - Added `current_usage` field to status line input, enabling accurate context window percentage calculations
> - Fixed input being cleared when processing queued commands while the user was typing
> - Fixed prompt suggestions replacing typed input when pressing Tab
> - Fixed diff view not updating when terminal is resized
> - Improved memory usage by 3x for large conversations
> - Improved resolution of stats screenshots copied to clipboard (Ctrl+S) for crisper images
> - Removed # shortcut for quick memory entry (tell Claude to edit your CLAUDE.md instead)
> - Fix thinking mode toggle in /config not persisting correctly
> - Improve UI for file creation permission dialog

### 2.0.69

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.69`)
- Bullets: `1`

> - Minor bugfixes

### 2.0.68

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.68`)
- Bullets: `6`

> - Fixed IME (Input Method Editor) support for languages like Chinese, Japanese, and Korean by correctly positioning the composition window at the cursor
> - Fixed a bug where disallowed MCP tools were visible to the model
> - Fixed an issue where steering messages could be lost while a subagent is working
> - Fixed Option+Arrow word navigation treating entire CJK (Chinese, Japanese, Korean) text sequences as a single word instead of navigating by word boundaries
> - Improved plan mode exit UX: show simplified yes/no dialog when exiting with empty or missing plan instead of throwing an error
> - Add support for enterprise managed settings. Contact your Anthropic account team to enable this feature.

### 2.0.67

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.67`)
- Bullets: `11`

> - Thinking mode is now enabled by default for Opus 4.5
> - Thinking mode configuration has moved to /config
> - Added search functionality to `/permissions` command with `/` keyboard shortcut for filtering rules by tool name
> - Show reason why autoupdater is disabled in `/doctor`
> - Fixed false "Another process is currently updating Claude" error when running `claude update` while another instance is already on the latest version
> - Fixed MCP servers from `.mcp.json` being stuck in pending state when running in non-interactive mode (`-p` flag or piped input)
> - Fixed scroll position resetting after deleting a permission rule in `/permissions`
> - Fixed word deletion (opt+delete) and word navigation (opt+arrow) not working correctly with non-Latin text such as Cyrillic, Greek, Arabic, Hebrew, Thai, and Chinese
> - Fixed `claude install --force` not bypassing stale lock files
> - Fixed consecutive @~/ file references in CLAUDE.md being incorrectly parsed due to markdown strikethrough interference
> - Windows: Fixed plugin MCP servers failing due to colons in log directory paths

### 2.0.65

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.65`)
- Bullets: `6`

> - Added ability to switch models while writing a prompt using alt+p (linux, windows), option+p (macos).
> - Added context window information to status line input
> - Added `fileSuggestion` setting for custom `@` file search commands
> - Added `CLAUDE_CODE_SHELL` environment variable to override automatic shell detection (useful when login shell differs from actual working shell)
> - Fixed prompt not being saved to history when aborting a query with Escape
> - Fixed Read tool image handling to identify format from bytes instead of file extension

### 2.0.64

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.64`)
- Bullets: `14`

> - Made auto-compacting instant
> - Agents and bash commands can run asynchronously and send messages to wake up the main agent
> - /stats now provides users with interesting CC stats, such as favorite model, usage graph, usage streak
> - Added named session support: use `/rename` to name sessions, `/resume <name>` in REPL or `claude --resume <name>` from the terminal to resume them
> - Added support for .claude/rules/`. See https://code.claude.com/docs/en/memory for details.
> - Added image dimension metadata when images are resized, enabling accurate coordinate mappings for large images
> - Fixed auto-loading .env when using native installer
> - Fixed `--system-prompt` being ignored when using `--continue` or `--resume` flags
> - Improved `/resume` screen with grouped forked sessions and keyboard shortcuts for preview (P) and rename (R)
> - VSCode: Added copy-to-clipboard button on code blocks and bash tool inputs
> - VSCode: Fixed extension not working on Windows ARM64 by falling back to x64 binary via emulation
> - Bedrock: Improve efficiency of token counting
> - Bedrock: Add support for `aws login` AWS Management Console credentials
> - Unshipped AgentOutputTool and BashOutputTool, in favor of a new unified TaskOutputTool

### 2.0.62

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.62`)
- Bullets: `7`

> - Added "(Recommended)" indicator for multiple-choice questions, with the recommended option moved to the top of the list
> - Added `attribution` setting to customize commit and PR bylines (deprecates `includeCoAuthoredBy`)
> - Fixed duplicate slash commands appearing when ~/.claude is symlinked to a project directory
> - Fixed slash command selection not working when multiple commands share the same name
> - Fixed an issue where skill files inside symlinked skill directories could become circular symlinks
> - Fixed running versions getting removed because lock file incorrectly going stale
> - Fixed IDE diff tab not closing when rejecting file changes

### 2.0.61

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.61`)
- Bullets: `1`

> - Reverted VSCode support for multiple terminal clients due to responsiveness issues.

### 2.0.60

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.60`)
- Bullets: `6`

> - Added background agent support. Agents run in the background while you work
> - Added --disable-slash-commands CLI flag to disable all slash commands
> - Added model name to "Co-Authored-By" commit messages
> - Enabled "/mcp enable [server-name]" or "/mcp disable [server-name]" to quickly toggle all servers
> - Updated Fetch to skip summarization for pre-approved websites
> - VSCode: Added support for multiple terminal clients connecting to the IDE server simultaneously

### 2.0.59

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.59`)
- Bullets: `3`

> - Added --agent CLI flag to override the agent setting for the current session
> - Added `agent` setting to configure main thread with a specific agent's system prompt, tool restrictions, and model
> - VS Code: Fixed .claude.json config file being read from incorrect location

### 2.0.58

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.58`)
- Bullets: `3`

> - Pro users now have access to Opus 4.5 as part of their subscription!
> - Fixed timer duration showing "11m 60s" instead of "12m 0s"
> - Windows: Managed settings now prefer `C:\Program Files\ClaudeCode` if it exists. Support for `C:\ProgramData\ClaudeCode` will be removed in a future version.

### 2.0.57

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.57`)
- Bullets: `2`

> - Added feedback input when rejecting plans, allowing users to tell Claude what to change
> - VSCode: Added streaming message support for real-time response display

### 2.0.56

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.56`)
- Bullets: `2`

> - Added setting to enable/disable terminal progress bar (OSC 9;4)
> - VSCode Extension: Added support for VS Code's secondary sidebar (VS Code 1.97+), allowing Claude Code to be displayed in the right sidebar while keeping the file explorer on the left. Requires setting sidebar as Preferred Location in the config.

### 2.0.55

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.55`)
- Bullets: `4`

> - Fixed proxy DNS resolution being forced on by default. Now opt-in via `CLAUDE_CODE_PROXY_RESOLVES_HOSTS=true` environment variable
> - Fixed keyboard navigation becoming unresponsive when holding down arrow keys in memory location selector
> - Improved AskUserQuestion tool to auto-submit single-select questions on the last question, eliminating the extra review screen for simple question flows
> - Improved fuzzy matching for `@` file suggestions with faster, more accurate results

### 2.0.54

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.54`)
- Bullets: `2`

> - Hooks: Enable PermissionRequest hooks to process 'always allow' suggestions and apply permission updates
> - Fix issue with excessive iTerm notifications

### 2.0.52

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.52`)
- Bullets: `4`

> - Fixed duplicate message display when starting Claude with a command line argument
> - Fixed `/usage` command progress bars to fill up as usage increases (instead of showing remaining percentage)
> - Fixed image pasting not working on Linux systems running Wayland (now falls back to wl-paste when xclip is unavailable)
> - Permit some uses of `$!` in bash commands

### 2.0.51

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.51`)
- Bullets: `9`

> - Added Opus 4.5! https://www.anthropic.com/news/claude-opus-4-5
> - Introducing Claude Code for Desktop: https://claude.com/download
> - To give you room to try out our new model, we've updated usage limits for Claude Code users. See the Claude Opus 4.5 blog for full details
> - Pro users can now purchase extra usage for access to Opus 4.5 in Claude Code
> - Plan Mode now builds more precise plans and executes more thoroughly
> - Usage limit notifications now easier to understand
> - Switched `/usage` back to "% used"
> - Fixed handling of thinking errors
> - Fixed performance regression

### 2.0.50

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.50`)
- Bullets: `4`

> - Fixed bug preventing calling MCP tools that have nested references in their input schemas
> - Silenced a noisy but harmless error during upgrades
> - Improved ultrathink text display
> - Improved clarity of 5-hour session limit warning message

### 2.0.49

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.49`)
- Bullets: `3`

> - Added readline-style ctrl-y for pasting deleted text
> - Improved clarity of usage limit warning message
> - Fixed handling of subagent permissions

### 2.0.47

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.47`)
- Bullets: `4`

> - Improved error messages and validation for `claude --teleport`
> - Improved error handling in `/usage`
> - Fixed race condition with history entry not getting logged at exit
> - Fixed Vertex AI configuration not being applied from `settings.json`

### 2.0.46

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.46`)
- Bullets: `1`

> - Fixed image files being reported with incorrect media type when format cannot be detected from metadata

### 2.0.45

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.45`)
- Bullets: `3`

> - Added support for Microsoft Foundry! See https://code.claude.com/docs/en/azure-ai-foundry
> - Added `PermissionRequest` hook to automatically approve or deny tool permission requests with custom logic
> - Send background tasks to Claude Code on the web by starting a message with `&`

### 2.0.43

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.43`)
- Bullets: `8`

> - Added `permissionMode` field for custom agents
> - Added `tool_use_id` field to `PreToolUseHookInput` and `PostToolUseHookInput` types
> - Added skills frontmatter field to declare skills to auto-load for subagents
> - Added the `SubagentStart` hook event
> - Fixed nested `CLAUDE.md` files not loading when @-mentioning files
> - Fixed duplicate rendering of some messages in the UI
> - Fixed some visual flickers
> - Fixed NotebookEdit tool inserting cells at incorrect positions when cell IDs matched the pattern `cell-N`

### 2.0.42

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.42`)
- Bullets: `1`

> - Added `agent_id` and `agent_transcript_path` fields to `SubagentStop` hooks.

### 2.0.41

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.41`)
- Bullets: `12`

> - Added `model` parameter to prompt-based stop hooks, allowing users to specify a custom model for hook evaluation
> - Fixed slash commands from user settings being loaded twice, which could cause rendering issues
> - Fixed incorrect labeling of user settings vs project settings in command descriptions
> - Fixed crash when plugin command hooks timeout during execution
> - Fixed: Bedrock users no longer see duplicate Opus entries in the /model picker when using `--model haiku`
> - Fixed broken security documentation links in trust dialogs and onboarding
> - Fixed issue where pressing ESC to close the diff modal would also interrupt the model
> - ctrl-r history search landing on a slash command no longer cancels the search
> - SDK: Support custom timeouts for hooks
> - Allow more safe git commands to run without approval
> - Plugins: Added support for sharing and installing output styles
> - Teleporting a session from web will automatically set the upstream branch

### 2.0.37

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.37`)
- Bullets: `3`

> - Fixed how idleness is computed for notifications
> - Hooks: Added matcher values for Notification hook events
> - Output Styles: Added `keep-coding-instructions` option to frontmatter

### 2.0.36

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.36`)
- Bullets: `3`

> - Fixed: DISABLE_AUTOUPDATER environment variable now properly disables package manager update notifications
> - Fixed queued messages being incorrectly executed as bash commands
> - Fixed input being lost when typing while a queued message is processed

### 2.0.35

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.35`)
- Bullets: `5`

> - Improve fuzzy search results when searching commands
> - Improved VS Code extension to respect `chat.fontSize` and `chat.fontFamily` settings throughout the entire UI, and apply font changes immediately without requiring reload
> - Added `CLAUDE_CODE_EXIT_AFTER_STOP_DELAY` environment variable to automatically exit SDK mode after a specified idle duration, useful for automated workflows and scripts
> - Migrated `ignorePatterns` from project config to deny permissions in the localSettings.
> - Fixed menu navigation getting stuck on items with empty string or other falsy values (e.g., in the `/hooks` menu)

### 2.0.34

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.34`)
- Bullets: `4`

> - VSCode Extension: Added setting to configure the initial permission mode for new conversations
> - Improved file path suggestion performance with native Rust-based fuzzy finder
> - Fixed infinite token refresh loop that caused MCP servers with OAuth (e.g., Slack) to hang during connection
> - Fixed memory crash when reading or writing large files (especially base64-encoded images)

### 2.0.33

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.33`)
- Bullets: `3`

> - Native binary installs now launch quicker.
> - Fixed `claude doctor` incorrectly detecting Homebrew vs npm-global installations by properly resolving symlinks
> - Fixed `claude mcp serve` exposing tools with incompatible outputSchemas

### 2.0.32

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.32`)
- Bullets: `3`

> - Un-deprecate output styles based on community feedback
> - Added `companyAnnouncements` setting for displaying announcements on startup
> - Fixed hook progress messages not updating correctly during PostToolUse hook execution

### 2.0.31

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.31`)
- Bullets: `6`

> - Windows: native installation uses shift+tab as shortcut for mode switching, instead of alt+m
> - Vertex: add support for Web Search on supported models
> - VSCode: Adding the respectGitIgnore configuration to include .gitignored files in file searches (defaults to true)
> - Fixed a bug with subagents and MCP servers related to "Tool names must be unique" error
> - Fixed issue causing `/compact` to fail with `prompt_too_long` by making it respect existing compact boundaries
> - Fixed plugin uninstall not removing plugins

### 2.0.30

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.30`)
- Bullets: `16`

> - Added helpful hint to run `security unlock-keychain` when encountering API key errors on macOS with locked keychain
> - Added `allowUnsandboxedCommands` sandbox setting to disable the dangerouslyDisableSandbox escape hatch at policy level
> - Added `disallowedTools` field to custom agent definitions for explicit tool blocking
> - Added prompt-based stop hooks
> - VSCode: Added respectGitIgnore configuration to include .gitignored files in file searches (defaults to true)
> - Enabled SSE MCP servers on native build
> - Deprecated output styles. Review options in `/output-style` and use --system-prompt-file, --system-prompt, --append-system-prompt, CLAUDE.md, or plugins instead
> - Removed support for custom ripgrep configuration, resolving an issue where Search returns no results and config discovery fails
> - Fixed Explore agent creating unwanted .md investigation files during codebase exploration
> - Fixed a bug where `/context` would sometimes fail with "max_tokens must be greater than thinking.budget_tokens" error message
> - Fixed `--mcp-config` flag to correctly override file-based MCP configurations
> - Fixed bug that saved session permissions to local settings
> - Fixed MCP tools not being available to sub-agents
> - Fixed hooks and plugins not executing when using --dangerously-skip-permissions flag
> - Fixed delay when navigating through typeahead suggestions with arrow keys
> - VSCode: Restored selection indicator in input footer showing current file or code selection status

### 2.0.28

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.28`)
- Bullets: `9`

> - Plan mode: introduced new Plan subagent
> - Subagents: claude can now choose to resume subagents
> - Subagents: claude can dynamically choose the model used by its subagents
> - SDK: added --max-budget-usd flag
> - Discovery of custom slash commands, subagents, and output styles no longer respects .gitignore
> - Stop `/terminal-setup` from adding backslash to `Shift + Enter` in VS Code
> - Add branch and tag support for git-based plugins and marketplaces using fragment syntax (e.g., `owner/repo#branch`)
> - Fixed a bug where macOS permission prompts would show up upon initial launch when launching from home directory
> - Various other bug fixes

### 2.0.27

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.27`)
- Bullets: `5`

> - New UI for permission prompts
> - Added current branch filtering and search to session resume screen for easier navigation
> - Fixed directory @-mention causing "No assistant message found" error
> - VSCode Extension: Add config setting to include .gitignored files in file searches
> - VSCode Extension: Bug fixes for unrelated 'Warmup' conversations, and configuration/settings occasionally being reset to defaults

### 2.0.25

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.25`)
- Bullets: `1`

> - Removed legacy SDK entrypoint. Please migrate to @anthropic-ai/claude-agent-sdk for future SDK updates: https://platform.claude.com/docs/en/agent-sdk/migration-guide

### 2.0.24

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.24`)
- Bullets: `4`

> - Fixed a bug where project-level skills were not loading when --setting-sources 'project' was specified
> - Claude Code Web: Support for Web -> CLI teleport
> - Sandbox: Releasing a sandbox mode for the BashTool on Linux & Mac
> - Bedrock: Display awsAuthRefresh output when auth is required

### 2.0.22

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.22`)
- Bullets: `4`

> - Fixed content layout shift when scrolling through slash commands
> - IDE: Add toggle to enable/disable thinking.
> - Fix bug causing duplicate permission prompts with parallel tool calls
> - Add support for enterprise managed MCP allowlist and denylist

### 2.0.21

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.21`)
- Bullets: `5`

> - Support MCP `structuredContent` field in tool responses
> - Added an interactive question tool
> - Claude will now ask you questions more often in plan mode
> - Added Haiku 4.5 as a model option for Pro users
> - Fixed an issue where queued commands don't have access to previous messages' output

### 2.0.20

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.20`)
- Bullets: `1`

> - Added support for Claude Skills

### 2.0.19

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.19`)
- Bullets: `2`

> - Auto-background long-running bash commands instead of killing them. Customize with BASH_DEFAULT_TIMEOUT_MS
> - Fixed a bug where Haiku was unnecessarily called in print mode

### 2.0.17

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.17`)
- Bullets: `6`

> - Added Haiku 4.5 to model selector!
> - Haiku 4.5 automatically uses Sonnet in plan mode, and Haiku for execution (i.e. SonnetPlan by default)
> - 3P (Bedrock and Vertex) are not automatically upgraded yet. Manual upgrading can be done through setting `ANTHROPIC_DEFAULT_HAIKU_MODEL`
> - Introducing the Explore subagent. Powered by Haiku it'll search through your codebase efficiently to save context!
> - OTEL: support HTTP_PROXY and HTTPS_PROXY
> - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` now disables release notes fetching

### 2.0.15

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.15`)
- Bullets: `2`

> - Fixed bug with resuming where previously created files needed to be read again before writing
> - Fixed bug with `-p` mode where @-mentioned files needed to be read again before writing

### 2.0.14

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.14`)
- Bullets: `7`

> - Fix @-mentioning MCP servers to toggle them on/off
> - Improve permission checks for bash with inline env vars
> - Fix ultrathink + thinking toggle
> - Reduce unnecessary logins
> - Document --system-prompt
> - Several improvements to rendering
> - Plugins UI polish

### 2.0.13

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.13`)
- Bullets: `1`

> - Fixed `/plugin` not working on native build

### 2.0.12

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.12`)
- Bullets: `11`

> - **Plugin System Released**: Extend Claude Code with custom commands, agents, hooks, and MCP servers from marketplaces
> - `/plugin install`, `/plugin enable/disable`, `/plugin marketplace` commands for plugin management
> - Repository-level plugin configuration via `extraKnownMarketplaces` for team collaboration
> - `/plugin validate` command for validating plugin structure and configuration
> - Plugin announcement blog post at https://www.anthropic.com/news/claude-code-plugins
> - Plugin documentation available at https://code.claude.com/docs/en/plugins
> - Comprehensive error messages and diagnostics via `/doctor` command
> - Avoid flickering in `/model` selector
> - Improvements to `/help`
> - Avoid mentioning hooks in `/resume` summaries
> - Changes to the "verbose" setting in `/config` now persist across sessions

### 2.0.11

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.11`)
- Bullets: `4`

> - Reduced system prompt size by 1.4k tokens
> - IDE: Fixed keyboard shortcuts and focus issues for smoother interaction
> - Fixed Opus fallback rate limit errors appearing incorrectly
> - Fixed /add-dir command selecting wrong default tab

### 2.0.10

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.10`)
- Bullets: `6`

> - Rewrote terminal renderer for buttery smooth UI
> - Enable/disable MCP servers by @mentioning, or in /mcp
> - Added tab completion for shell commands in bash mode
> - PreToolUse hooks can now modify tool inputs
> - Press Ctrl-G to edit your prompt in your system's configured text editor
> - Fixes for bash permission checks with environment variables in the command

### 2.0.9

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.9`)
- Bullets: `1`

> - Fix regression where bash backgrounding stopped working

### 2.0.8

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.8`)
- Bullets: `5`

> - Update Bedrock default Sonnet model to `global.anthropic.claude-sonnet-4-5-20250929-v1:0`
> - IDE: Add drag-and-drop support for files and folders in chat
> - /context: Fix counting for thinking blocks
> - Improve message rendering for users with light themes on dark terminals
> - Remove deprecated .claude.json allowedTools, ignorePatterns, env, and todoFeatureEnabled config options (instead, configure these in your settings.json)

### 2.0.5

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.5`)
- Bullets: `4`

> - IDE: Fix IME unintended message submission with Enter and Tab
> - IDE: Add "Open in Terminal" link in login screen
> - Fix unhandled OAuth expiration 401 API errors
> - SDK: Added SDKUserMessageReplay.isReplay to prevent duplicate messages

### 2.0.1

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.1`)
- Bullets: `2`

> - Skip Sonnet 4.5 default model setting change for Bedrock and Vertex
> - Various bug fixes and presentation improvements

### 2.0.0

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 2.0.0`)
- Bullets: `10`

> - New native VS Code extension
> - Fresh coat of paint throughout the whole app
> - /rewind a conversation to undo code changes
> - /usage command to see plan limits
> - Tab to toggle thinking (sticky across sessions)
> - Ctrl-R to search history
> - Unshipped claude config command
> - Hooks: Reduced PostToolUse 'tool_use' ids were found without 'tool_result' blocks errors
> - SDK: The Claude Code SDK is now the Claude Agent SDK
> - Add subagents dynamically with `--agents` flag

### 1.0.126

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.126`)
- Bullets: `2`

> - Enable /context command for Bedrock and Vertex
> - Add mTLS support for HTTP-based OpenTelemetry exporters

### 1.0.124

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.124`)
- Bullets: `5`

> - Set `CLAUDE_BASH_NO_LOGIN` environment variable to 1 or true to to skip login shell for BashTool
> - Fix Bedrock and Vertex environment variables evaluating all strings as truthy
> - No longer inform Claude of the list of allowed tools when permission is denied
> - Fixed security vulnerability in Bash tool permission checks
> - Improved VSCode extension performance for large files

### 1.0.123

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.123`)
- Bullets: `7`

> - Bash permission rules now support output redirections when matching (e.g., `Bash(python:*)` matches `python script.py > output.txt`)
> - Fixed thinking mode triggering on negation phrases like "don't think"
> - Fixed rendering performance degradation during token streaming
> - Added SlashCommand tool, which enables Claude to invoke your slash commands. https://code.claude.com/docs/en/slash-commands#SlashCommand-tool
> - Enhanced BashTool environment snapshot logging
> - Fixed a bug where resuming a conversation in headless mode would sometimes enable thinking unnecessarily
> - Migrated --debug logging to a file, to enable easy tailing & filtering

### 1.0.120

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.120`)
- Bullets: `5`

> - Fix input lag during typing, especially noticeable with large prompts
> - Improved VSCode extension command registry and sessions dialog user experience
> - Enhanced sessions dialog responsiveness and visual feedback
> - Fixed IDE compatibility issue by removing worktree support check
> - Fixed security vulnerability where Bash tool permission checks could be bypassed using prefix matching

### 1.0.119

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.119`)
- Bullets: `4`

> - Fix Windows issue where process visually freezes on entering interactive mode
> - Support dynamic headers for MCP servers via headersHelper configuration
> - Fix thinking mode not working in headless sessions
> - Fix slash commands now properly update allowed tools instead of replacing them

### 1.0.117

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.117`)
- Bullets: `5`

> - Add Ctrl-R history search to recall previous commands like bash/zsh
> - Fix input lag while typing, especially on Windows
> - Add sed command to auto-allowed commands in acceptEdits mode
> - Fix Windows PATH comparison to be case-insensitive for drive letters
> - Add permissions management hint to /add-dir output

### 1.0.115

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.115`)
- Bullets: `6`

> - Improve thinking mode display with enhanced visual effects
> - Type /t to temporarily disable thinking mode in your prompt
> - Improve path validation for glob and grep tools
> - Show condensed output for post-tool hooks to reduce visual clutter
> - Fix visual feedback when loading state completes
> - Improve UI consistency for permission request dialogs

### 1.0.113

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.113`)
- Bullets: `2`

> - Deprecated piped input in interactive mode
> - Move Ctrl+R keybinding for toggling transcript to Ctrl+O

### 1.0.112

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.112`)
- Bullets: `5`

> - Transcript mode (Ctrl+R): Added the model used to generate each assistant message
> - Addressed issue where some Claude Max users were incorrectly recognized as Claude Pro users
> - Hooks: Added systemMessage support for SessionEnd hooks
> - Added `spinnerTipsEnabled` setting to disable spinner tips
> - IDE: Various improvements and bug fixes

### 1.0.111

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.111`)
- Bullets: `2`

> - /model now validates provided model names
> - Fixed Bash tool crashes caused by malformed shell syntax parsing

### 1.0.110

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.110`)
- Bullets: `3`

> - /terminal-setup command now supports WezTerm
> - MCP: OAuth tokens now proactively refresh before expiration
> - Fixed reliability issues with background Bash processes

### 1.0.109

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.109`)
- Bullets: `1`

> - SDK: Added partial message streaming support via `--include-partial-messages` CLI flag

### 1.0.106

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.106`)
- Bullets: `1`

> - Windows: Fixed path permission matching to consistently use POSIX format (e.g., `Read(//c/Users/...)`)

### 1.0.97

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.97`)
- Bullets: `1`

> - Settings: /doctor now validates permission rule syntax and suggests corrections

### 1.0.94

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.94`)
- Bullets: `4`

> - Vertex: add support for global endpoints for supported models
> - /memory command now allows direct editing of all imported memory files
> - SDK: Add custom tools as callbacks
> - Added /todos command to list current todo items

### 1.0.93

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.93`)
- Bullets: `2`

> - Windows: Add alt + v shortcut for pasting images from clipboard
> - Support NO_PROXY environment variable to bypass proxy for specified hostnames and IPs

### 1.0.90

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.90`)
- Bullets: `1`

> - Settings file changes take effect immediately - no restart required

### 1.0.88

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.88`)
- Bullets: `5`

> - Fixed issue causing "OAuth authentication is currently not supported"
> - Status line input now includes `exceeds_200k_tokens`
> - Fixed incorrect usage tracking in /cost.
> - Introduced `ANTHROPIC_DEFAULT_SONNET_MODEL` and `ANTHROPIC_DEFAULT_OPUS_MODEL` for controlling model aliases opusplan, opus, and sonnet.
> - Bedrock: Updated default Sonnet model to Sonnet 4

### 1.0.86

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.86`)
- Bullets: `3`

> - Added /context to help users self-serve debug context issues
> - SDK: Added UUID support for all SDK messages
> - SDK: Added `--replay-user-messages` to replay user messages back to stdout

### 1.0.85

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.85`)
- Bullets: `2`

> - Status line input now includes session cost info
> - Hooks: Introduced SessionEnd hook

### 1.0.84

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.84`)
- Bullets: `4`

> - Fix tool_use/tool_result id mismatch error when network is unstable
> - Fix Claude sometimes ignoring real-time steering when wrapping up a task
> - @-mention: Add ~/.claude/\* files to suggestions for easier agent, output style, and slash command editing
> - Use built-in ripgrep by default; to opt out of this behavior, set USE_BUILTIN_RIPGREP=0

### 1.0.83

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.83`)
- Bullets: `2`

> - @-mention: Support files with spaces in path
> - New shimmering spinner

### 1.0.82

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.82`)
- Bullets: `5`

> - SDK: Add request cancellation support
> - SDK: New additionalDirectories option to search custom paths, improved slash command processing
> - Settings: Validation prevents invalid fields in .claude/settings.json files
> - MCP: Improve tool name consistency
> - Bash: Fix crash when Claude tries to automatically read large files

### 1.0.81

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.81`)
- Bullets: `2`

> - Released output styles, including new built-in educational output styles "Explanatory" and "Learning". Docs: https://code.claude.com/docs/en/output-styles
> - Agents: Fix custom agent loading when agent files are unparsable

### 1.0.80

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.80`)
- Bullets: `1`

> - UI improvements: Fix text contrast for custom subagent colors and spinner rendering issues

### 1.0.77

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.77`)
- Bullets: `4`

> - Bash tool: Fix heredoc and multiline string escaping, improve stderr redirection handling
> - SDK: Add session support and permission denial tracking
> - Fix token limit errors in conversation summarization
> - Opus Plan Mode: New setting in `/model` to run Opus only in plan mode, Sonnet otherwise

### 1.0.73

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.73`)
- Bullets: `5`

> - MCP: Support multiple config files with `--mcp-config file1.json file2.json`
> - MCP: Press Esc to cancel OAuth authentication flows
> - Bash: Improved command validation and reduced false security warnings
> - UI: Enhanced spinner animations and status line visual hierarchy
> - Linux: Added support for Alpine and musl-based distributions (requires separate ripgrep installation)

### 1.0.72

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.72`)
- Bullets: `1`

> - Ask permissions: have Claude Code always ask for confirmation to use specific tools with /permissions

### 1.0.71

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.71`)
- Bullets: `2`

> - Background commands: (Ctrl-b) to run any Bash command in the background so Claude can keep working (great for dev servers, tailing logs, etc.)
> - Customizable status line: add your terminal prompt to Claude Code with /statusline

### 1.0.70

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.70`)
- Bullets: `3`

> - Performance: Optimized message rendering for better performance with large contexts
> - Windows: Fixed native file search, ripgrep, and subagent functionality
> - Added support for @-mentions in slash command arguments

### 1.0.69

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.69`)
- Bullets: `1`

> - Upgraded Opus to version 4.1

### 1.0.68

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.68`)
- Bullets: `7`

> - Fix incorrect model names being used for certain commands like `/pr-comments`
> - Windows: improve permissions checks for allow / deny tools and project trust. This may create a new project entry in `.claude.json` - manually merge the history field if desired.
> - Windows: improve sub-process spawning to eliminate "No such file or directory" when running commands like pnpm
> - Enhanced /doctor command with CLAUDE.md and MCP tool context for self-serve debugging
> - SDK: Added canUseTool callback support for tool confirmation
> - Added `disableAllHooks` setting
> - Improved file suggestions performance in large repos

### 1.0.65

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.65`)
- Bullets: `2`

> - IDE: Fixed connection stability issues and error handling for diagnostics
> - Windows: Fixed shell environment setup for users without .bashrc files

### 1.0.64

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.64`)
- Bullets: `5`

> - Agents: Added model customization support - you can now specify which model an agent should use
> - Agents: Fixed unintended access to the recursive agent tool
> - Hooks: Added systemMessage field to hook JSON output for displaying warnings and context
> - SDK: Fixed user input tracking across multi-turn conversations
> - Added hidden files to file search and @-mention suggestions

### 1.0.63

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.63`)
- Bullets: `1`

> - Windows: Fixed file search, @agent mentions, and custom slash commands functionality

### 1.0.62

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.62`)
- Bullets: `4`

> - Added @-mention support with typeahead for custom agents. @<your-custom-agent> to invoke it
> - Hooks: Added SessionStart hook for new session initialization
> - /add-dir command now supports typeahead for directory paths
> - Improved network connectivity check reliability

### 1.0.61

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.61`)
- Bullets: `8`

> - Transcript mode (Ctrl+R): Changed Esc to exit transcript mode rather than interrupt
> - Settings: Added `--settings` flag to load settings from a JSON file
> - Settings: Fixed resolution of settings files paths that are symlinks
> - OTEL: Fixed reporting of wrong organization after authentication changes
> - Slash commands: Fixed permissions checking for allowed-tools with Bash
> - IDE: Added support for pasting images in VSCode MacOS using ⌘+V
> - IDE: Added `CLAUDE_CODE_AUTO_CONNECT_IDE=false` for disabling IDE auto-connection
> - Added `CLAUDE_CODE_SHELL_PREFIX` for wrapping Claude and user-provided shell commands run by Claude Code

### 1.0.60

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.60`)
- Bullets: `1`

> - You can now create custom subagents for specialized tasks! Run /agents to get started

### 1.0.59

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.59`)
- Bullets: `5`

> - SDK: Added tool confirmation support with canUseTool callback
> - SDK: Allow specifying env for spawned process
> - Hooks: Exposed PermissionDecision to hooks (including "ask")
> - Hooks: UserPromptSubmit now supports additionalContext in advanced JSON output
> - Fixed issue where some Max users that specified Opus would still see fallback to Sonnet

### 1.0.58

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.58`)
- Bullets: `3`

> - Added support for reading PDFs
> - MCP: Improved server health status display in 'claude mcp list'
> - Hooks: Added CLAUDE_PROJECT_DIR env var for hook commands

### 1.0.57

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.57`)
- Bullets: `3`

> - Added support for specifying a model in slash commands
> - Improved permission messages to help Claude understand allowed tools
> - Fix: Remove trailing newlines from bash output in terminal wrapping

### 1.0.56

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.56`)
- Bullets: `3`

> - Windows: Enabled shift+tab for mode switching on versions of Node.js that support terminal VT mode
> - Fixes for WSL IDE detection
> - Fix an issue causing awsRefreshHelper changes to .aws directory not to be picked up

### 1.0.55

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.55`)
- Bullets: `4`

> - Clarified knowledge cutoff for Opus 4 and Sonnet 4 models
> - Windows: fixed Ctrl+Z crash
> - SDK: Added ability to capture error logging
> - Add --system-prompt-file option to override system prompt in print mode

### 1.0.54

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.54`)
- Bullets: `5`

> - Hooks: Added UserPromptSubmit hook and the current working directory to hook inputs
> - Custom slash commands: Added argument-hint to frontmatter
> - Windows: OAuth uses port 45454 and properly constructs browser URL
> - Windows: mode switching now uses alt + m, and plan mode renders properly
> - Shell: Switch to in-memory shell snapshot to fix file-related errors

### 1.0.53

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.53`)
- Bullets: `2`

> - Updated @-mention file truncation from 100 lines to 2000 lines
> - Add helper script settings for AWS token refresh: awsAuthRefresh (for foreground operations like aws sso login) and awsCredentialExport (for background operation with STS-like response).

### 1.0.52

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.52`)
- Bullets: `1`

> - Added support for MCP server instructions

### 1.0.51

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.51`)
- Bullets: `9`

> - Added support for native Windows (requires Git for Windows)
> - Added support for Bedrock API keys through environment variable AWS_BEARER_TOKEN_BEDROCK
> - Settings: /doctor can now help you identify and fix invalid setting files
> - `--append-system-prompt` can now be used in interactive mode, not just --print/-p.
> - Increased auto-compact warning threshold from 60% to 80%
> - Fixed an issue with handling user directories with spaces for shell snapshots
> - OTEL resource now includes os.type, os.version, host.arch, and wsl.version (if running on Windows Subsystem for Linux)
> - Custom slash commands: Fixed user-level commands in subdirectories
> - Plan mode: Fixed issue where rejected plan from sub-task would get discarded

### 1.0.48

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.48`)
- Bullets: `7`

> - Fixed a bug in v1.0.45 where the app would sometimes freeze on launch
> - Added progress messages to Bash tool based on the last 5 lines of command output
> - Added expanding variables support for MCP server configuration
> - Moved shell snapshots from /tmp to ~/.claude for more reliable Bash tool calls
> - Improved IDE extension path handling when Claude Code runs in WSL
> - Hooks: Added a PreCompact hook
> - Vim mode: Added c, f/F, t/T

### 1.0.45

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.45`)
- Bullets: `6`

> - Redesigned Search (Grep) tool with new tool input parameters and features
> - Disabled IDE diffs for notebook files, fixing "Timeout waiting after 1000ms" error
> - Fixed config file corruption issue by enforcing atomic writes
> - Updated prompt input undo to Ctrl+\_ to avoid breaking existing Ctrl+U behavior, matching zsh's undo shortcut
> - Stop Hooks: Fixed transcript path after /clear and fixed triggering when loop ends with tool call
> - Custom slash commands: Restored namespacing in command names based on subdirectories. For example, .claude/commands/frontend/component.md is now /frontend:component, not /component.

### 1.0.44

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.44`)
- Bullets: `4`

> - New /export command lets you quickly export a conversation for sharing
> - MCP: resource_link tool results are now supported
> - MCP: tool annotations and tool titles now display in /mcp view
> - Changed Ctrl+Z to suspend Claude Code. Resume by running `fg`. Prompt input undo is now Ctrl+U.

### 1.0.43

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.43`)
- Bullets: `2`

> - Fixed a bug where the theme selector was saving excessively
> - Hooks: Added EPIPE system error handling

### 1.0.42

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.42`)
- Bullets: `1`

> - Added tilde (`~`) expansion support to `/add-dir` command

### 1.0.41

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.41`)
- Bullets: `5`

> - Hooks: Split Stop hook triggering into Stop and SubagentStop
> - Hooks: Enabled optional timeout configuration for each command
> - Hooks: Added "hook_event_name" to hook input
> - Fixed a bug where MCP tools would display twice in tool list
> - New tool parameters JSON for Bash tool in `tool_decision` event

### 1.0.40

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.40`)
- Bullets: `1`

> - Fixed a bug causing API connection errors with UNABLE_TO_GET_ISSUER_CERT_LOCALLY if `NODE_EXTRA_CA_CERTS` was set

### 1.0.39

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.39`)
- Bullets: `1`

> - New Active Time metric in OpenTelemetry logging

### 1.0.38

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.38`)
- Bullets: `1`

> - Released hooks. Special thanks to community input in https://github.com/anthropics/claude-code/issues/712. Docs: https://code.claude.com/docs/en/hooks

### 1.0.37

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.37`)
- Bullets: `1`

> - Remove ability to set `Proxy-Authorization` header via ANTHROPIC_AUTH_TOKEN or apiKeyHelper

### 1.0.36

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.36`)
- Bullets: `2`

> - Web search now takes today's date into context
> - Fixed a bug where stdio MCP servers were not terminating properly on exit

### 1.0.35

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.35`)
- Bullets: `1`

> - Added support for MCP OAuth Authorization Server discovery

### 1.0.34

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.34`)
- Bullets: `1`

> - Fixed a memory leak causing a MaxListenersExceededWarning message to appear

### 1.0.33

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.33`)
- Bullets: `3`

> - Improved logging functionality with session ID support
> - Added prompt input undo functionality (Ctrl+Z and vim 'u' command)
> - Improvements to plan mode

### 1.0.32

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.32`)
- Bullets: `2`

> - Updated loopback config for litellm
> - Added forceLoginMethod setting to bypass login selection screen

### 1.0.31

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.31`)
- Bullets: `1`

> - Fixed a bug where ~/.claude.json would get reset when file contained invalid JSON

### 1.0.30

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.30`)
- Bullets: `4`

> - Custom slash commands: Run bash output, @-mention files, enable thinking with thinking keywords
> - Improved file path autocomplete with filename matching
> - Added timestamps in Ctrl-r mode and fixed Ctrl-c handling
> - Enhanced jq regex support for complex filters with pipes and select

### 1.0.29

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.29`)
- Bullets: `1`

> - Improved CJK character support in cursor navigation and rendering

### 1.0.28

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.28`)
- Bullets: `5`

> - Slash commands: Fix selector display during history navigation
> - Resizes images before upload to prevent API size limit errors
> - Added XDG_CONFIG_HOME support to configuration directory
> - Performance optimizations for memory usage
> - New attributes (terminal.type, language) in OpenTelemetry logging

### 1.0.27

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.27`)
- Bullets: `4`

> - Streamable HTTP MCP servers are now supported
> - Remote MCP servers (SSE and HTTP) now support OAuth
> - MCP resources can now be @-mentioned
> - /resume slash command to switch conversations within Claude Code

### 1.0.25

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.25`)
- Bullets: `4`

> - Slash commands: moved "project" and "user" prefixes to descriptions
> - Slash commands: improved reliability for command discovery
> - Improved support for Ghostty
> - Improved web search reliability

### 1.0.24

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.24`)
- Bullets: `2`

> - Improved /mcp output
> - Fixed a bug where settings arrays got overwritten instead of merged

### 1.0.23

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.23`)
- Bullets: `2`

> - Released TypeScript SDK: import @anthropic-ai/claude-code to get started
> - Released Python SDK: pip install claude-code-sdk to get started

### 1.0.22

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.22`)
- Bullets: `1`

> - SDK: Renamed `total_cost` to `total_cost_usd`

### 1.0.21

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.21`)
- Bullets: `3`

> - Improved editing of files with tab-based indentation
> - Fix for tool_use without matching tool_result errors
> - Fixed a bug where stdio MCP server processes would linger after quitting Claude Code

### 1.0.18

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.18`)
- Bullets: `8`

> - Added --add-dir CLI argument for specifying additional working directories
> - Added streaming input support without require -p flag
> - Improved startup performance and session storage performance
> - Added CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR environment variable to freeze working directory for bash commands
> - Added detailed MCP server tools display (/mcp)
> - MCP authentication and permission improvements
> - Added auto-reconnection for MCP SSE connections on disconnect
> - Fixed issue where pasted content was lost when dialogs appeared

### 1.0.17

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.17`)
- Bullets: `4`

> - We now emit messages from sub-tasks in -p mode (look for the parent_tool_use_id property)
> - Fixed crashes when the VS Code diff tool is invoked multiple times quickly
> - MCP server list UI improvements
> - Update Claude Code process title to display "claude" instead of "node"

### 1.0.11

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.11`)
- Bullets: `5`

> - Claude Code can now also be used with a Claude Pro subscription
> - Added /upgrade for smoother switching to Claude Max plans
> - Improved UI for authentication from API keys and Bedrock/Vertex/external auth tokens
> - Improved shell configuration error handling
> - Improved todo list handling during compaction

### 1.0.10

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.10`)
- Bullets: `2`

> - Added markdown table support
> - Improved streaming performance

### 1.0.8

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.8`)
- Bullets: `6`

> - Fixed Vertex AI region fallback when using CLOUD_ML_REGION
> - Increased default otel interval from 1s -> 5s
> - Fixed edge cases where MCP_TIMEOUT and MCP_TOOL_TIMEOUT weren't being respected
> - Fixed a regression where search tools unnecessarily asked for permissions
> - Added support for triggering thinking non-English languages
> - Improved compacting UI

### 1.0.7

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.7`)
- Bullets: `6`

> - Renamed /allowed-tools -> /permissions
> - Migrated allowedTools and ignorePatterns from .claude.json -> settings.json
> - Deprecated claude config commands in favor of editing settings.json
> - Fixed a bug where --dangerously-skip-permissions sometimes didn't work in --print mode
> - Improved error handling for /install-github-app
> - Bugfixes, UI polish, and tool reliability improvements

### 1.0.6

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.6`)
- Bullets: `5`

> - Improved edit reliability for tab-indented files
> - Respect CLAUDE_CONFIG_DIR everywhere
> - Reduced unnecessary tool permission prompts
> - Added support for symlinks in @file typeahead
> - Bugfixes, UI polish, and tool reliability improvements

### 1.0.4

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.4`)
- Bullets: `1`

> - Fixed a bug where MCP tool errors weren't being parsed correctly

### 1.0.1

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.1`)
- Bullets: `3`

> - Added `DISABLE_INTERLEAVED_THINKING` to give users the option to opt out of interleaved thinking.
> - Improved model references to show provider-specific names (Sonnet 3.7 for Bedrock, Sonnet 4 for Console)
> - Updated documentation links and OAuth process descriptions

### 1.0.0

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 1.0.0`)
- Bullets: `2`

> - Claude Code is now generally available
> - Introducing Sonnet 4 and Opus 4 models

### 0.2.125

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.125`)
- Bullets: `2`

> - Breaking change: Bedrock ARN passed to `ANTHROPIC_MODEL` or `ANTHROPIC_SMALL_FAST_MODEL` should no longer contain an escaped slash (specify `/` instead of `%2F`)
> - Removed `DEBUG=true` in favor of `ANTHROPIC_LOG=debug`, to log all requests

### 0.2.117

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.117`)
- Bullets: `4`

> - Breaking change: --print JSON output now returns nested message objects, for forwards-compatibility as we introduce new metadata fields
> - Introduced settings.cleanupPeriodDays
> - Introduced CLAUDE_CODE_API_KEY_HELPER_TTL_MS env var
> - Introduced --debug mode

### 0.2.108

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.108`)
- Bullets: `6`

> - You can now send messages to Claude while it works to steer Claude in real-time
> - Introduced BASH_DEFAULT_TIMEOUT_MS and BASH_MAX_TIMEOUT_MS env vars
> - Fixed a bug where thinking was not working in -p mode
> - Fixed a regression in /cost reporting
> - Deprecated MCP wizard interface in favor of other MCP commands
> - Lots of other bugfixes and improvements

### 0.2.107

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.107`)
- Bullets: `1`

> - CLAUDE.md files can now import other files. Add @path/to/file.md to ./CLAUDE.md to load additional files on launch

### 0.2.106

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.106`)
- Bullets: `2`

> - MCP SSE server configs can now specify custom headers
> - Fixed a bug where MCP permission prompt didn't always show correctly

### 0.2.105

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.105`)
- Bullets: `4`

> - Claude can now search the web
> - Moved system & account status to /status
> - Added word movement keybindings for Vim
> - Improved latency for startup, todo tool, and file edits

### 0.2.102

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.102`)
- Bullets: `3`

> - Improved thinking triggering reliability
> - Improved @mention reliability for images and folders
> - You can now paste multiple large chunks into one prompt

### 0.2.100

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.100`)
- Bullets: `2`

> - Fixed a crash caused by a stack overflow error
> - Made db storage optional; missing db support disables --continue and --resume

### 0.2.98

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.98`)
- Bullets: `1`

> - Fixed an issue where auto-compact was running twice

### 0.2.96

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.96`)
- Bullets: `1`

> - Claude Code can now also be used with a Claude Max subscription (https://claude.ai/upgrade)

### 0.2.93

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.93`)
- Bullets: `2`

> - Resume conversations from where you left off from with "claude --continue" and "claude --resume"
> - Claude now has access to a Todo list that helps it stay on track and be more organized

### 0.2.82

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.82`)
- Bullets: `2`

> - Added support for --disallowedTools
> - Renamed tools for consistency: LSTool -> LS, View -> Read, etc.

### 0.2.75

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.75`)
- Bullets: `5`

> - Hit Enter to queue up additional messages while Claude is working
> - Drag in or copy/paste image files directly into the prompt
> - @-mention files to directly add them to context
> - Run one-off MCP servers with `claude --mcp-config <path-to-file>`
> - Improved performance for filename auto-complete

### 0.2.74

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.74`)
- Bullets: `2`

> - Added support for refreshing dynamically generated API keys (via apiKeyHelper), with a 5 minute TTL
> - Task tool can now perform writes and run bash commands

### 0.2.72

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.72`)
- Bullets: `1`

> - Updated spinner to indicate tokens loaded and tool usage

### 0.2.70

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.70`)
- Bullets: `3`

> - Network commands like curl are now available for Claude to use
> - Claude can now run multiple web queries in parallel
> - Pressing ESC once immediately interrupts Claude in Auto-accept mode

### 0.2.69

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.69`)
- Bullets: `2`

> - Fixed UI glitches with improved Select component behavior
> - Enhanced terminal output display with better text truncation logic

### 0.2.67

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.67`)
- Bullets: `1`

> - Shared project permission rules can be saved in .claude/settings.json

### 0.2.66

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.66`)
- Bullets: `2`

> - Print mode (-p) now supports streaming output via --output-format=stream-json
> - Fixed issue where pasting could trigger memory or bash mode unexpectedly

### 0.2.63

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.63`)
- Bullets: `1`

> - Fixed an issue where MCP tools were loaded twice, which caused tool call errors

### 0.2.61

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.61`)
- Bullets: `3`

> - Navigate menus with vim-style keys (j/k) or bash/emacs shortcuts (Ctrl+n/p) for faster interaction
> - Enhanced image detection for more reliable clipboard paste functionality
> - Fixed an issue where ESC key could crash the conversation history selector

### 0.2.59

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.59`)
- Bullets: `3`

> - Copy+paste images directly into your prompt
> - Improved progress indicators for bash and fetch tools
> - Bugfixes for non-interactive mode (-p)

### 0.2.54

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.54`)
- Bullets: `3`

> - Quickly add to Memory by starting your message with '#'
> - Press ctrl+r to see full output for long tool results
> - Added support for MCP SSE transport

### 0.2.53

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.53`)
- Bullets: `2`

> - New web fetch tool lets Claude view URLs that you paste in
> - Fixed a bug with JPEG detection

### 0.2.50

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.50`)
- Bullets: `1`

> - New MCP "project" scope now allows you to add MCP servers to .mcp.json files and commit them to your repository

### 0.2.49

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.49`)
- Bullets: `1`

> - Previous MCP server scopes have been renamed: previous "project" scope is now "local" and "global" scope is now "user"

### 0.2.47

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.47`)
- Bullets: `3`

> - Press Tab to auto-complete file and folder names
> - Press Shift + Tab to toggle auto-accept for file edits
> - Automatic conversation compaction for infinite conversation length (toggle with /config)

### 0.2.44

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.44`)
- Bullets: `1`

> - Ask Claude to make a plan with thinking mode: just say 'think' or 'think harder' or even 'ultrathink'

### 0.2.41

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.41`)
- Bullets: `2`

> - MCP server startup timeout can now be configured via MCP_TIMEOUT environment variable
> - MCP server startup no longer blocks the app from starting up

### 0.2.37

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.37`)
- Bullets: `2`

> - New /release-notes command lets you view release notes at any time
> - `claude config add/remove` commands now accept multiple values separated by commas or spaces

### 0.2.36

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.36`)
- Bullets: `2`

> - Import MCP servers from Claude Desktop with `claude mcp add-from-claude-desktop`
> - Add MCP servers as JSON strings with `claude mcp add-json <n> <json>`

### 0.2.34

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.34`)
- Bullets: `1`

> - Vim bindings for text input - enable with /vim or /config

### 0.2.32

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.32`)
- Bullets: `2`

> - Interactive MCP setup wizard: Run "claude mcp add" to add MCP servers with a step-by-step interface
> - Fix for some PersistentShell issues

### 0.2.31

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.31`)
- Bullets: `2`

> - Custom slash commands: Markdown files in .claude/commands/ directories now appear as custom slash commands to insert prompts into your conversation
> - MCP debug mode: Run with --mcp-debug flag to get more information about MCP server errors

### 0.2.30

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.30`)
- Bullets: `3`

> - Added ANSI color theme for better terminal compatibility
> - Fixed issue where slash command arguments weren't being sent properly
> - (Mac-only) API keys are now stored in macOS Keychain

### 0.2.26

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.26`)
- Bullets: `3`

> - New /approved-tools command for managing tool permissions
> - Word-level diff display for improved code readability
> - Fuzzy matching for slash commands

### 0.2.21

- Source: `<CLAUDE_CODE_ROOT>/CHANGELOG.md` (section: `## 0.2.21`)
- Bullets: `1`

> - Fuzzy matching for /commands
