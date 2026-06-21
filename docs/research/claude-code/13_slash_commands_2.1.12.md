# Claude Code built-in slash commands — `@anthropic-ai/claude-code@2.1.12`

Evidence anchor:

- `cli.js` sha256: `5ab5ab592cc2342aa4602eab4e84e82bcff91765bd22cb4dcd51284cf20b8e86`
- Source: `<CLAUDE_CODE_PKG_ROOT>/cli.js`

Extraction notes (static, no execution):

- `cli.js` is minified and uses multiple shapes for `userFacingName`:
  - `userFacingName(){return"..."}` (method)
  - `userFacingName:()=>"..."` (arrow)
  - `userFacingName(){return this.name}` (derived from `name`)
  - some commands (e.g. `install`) do not carry a literal `userFacingName`, so the union also includes names derived from nearby `type:"local(-jsx)"` command objects.
- This list is the **union** of:
  - string-literal `userFacingName` values (method + arrow),
  - `name:"..."` where `userFacingName(){return this.name}` is present,
  - nearest `name:"..."` around `type:"local"` / `type:"local-jsx"` blocks that also include a `description:"..."` literal (to avoid unrelated `name:` occurrences).

## Canonical command names (60)

```text
add-dir
agents
btw
chrome
clear
color
compact
config
context
cost
discover
doctor
exit
export
extra-usage
feedback
files
fork
help
hooks
ide
init
install
install-github-app
install-slack-app
keybindings
login
logout
mcp
memory
mobile
model
output-style
passes
permissions
plan
plugin
privacy-settings
rate-limit-options
release-notes
remote-env
rename
resume
rewind
sandbox
skills
stats
status
statusline
stickers
tag
tasks
terminal-setup
theme
think-back
thinkback-play
todos
upgrade
usage
vim
```
