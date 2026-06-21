# `claude-code-open-main` audit (hypothesis generator, not an official source)

This doc treats `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main` as a **hypothesis generator** only. Every “official behavior” claim is tagged as:

- **CONFIRMED (CHANGELOG)**: backed by `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code/CHANGELOG.md` (referenced via `docs/research/reference/changelog.lines.md` which is a line-indexed mirror of that file).
- **CONFIRMED (cli.js)**: backed by a literal substring present in `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code/node_modules/@anthropic-ai/claude-code/cli.js` (obfuscated/minified, so we cite search needles + tight excerpts).
- **UNCONFIRMED**: open-main claim/code with no corroboration yet.
- **PARTIAL**: open-main implements a subset of the official feature.

## 0) Provenance + version consistency issues (open-main)

Open-main is internally inconsistent about which Claude Code version it targets; treat any “v2.1.x official behavior” comments as **non-authoritative** unless corroborated.

- README claims it’s based on `@anthropic-ai/claude-code v2.1.4`:

```md
# /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/README.md

A reverse-engineered restoration based on `@anthropic-ai/claude-code` v2.1.4.
```

- But `package.json` declares `version: 2.1.7`:

```json
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/package.json
  "version": "2.1.7",
```

- And `src/version.ts` hardcodes `2.1.4`:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/version.ts
export const VERSION = '2.1.4'
export const VERSION_FULL = '2.1.4-restored'
```

## 1) High-level repo map (open-main, observed from imports/paths)

Open-main is a full “Claude Code-like” CLI + WebUI reimplementation with a wide module surface:

- Entry points:
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/cli.ts` (Ink CLI)
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/web-cli.ts` (Web mode)
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/index.ts` (exports)
- Orchestration/core:
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/core/loop.ts` (conversation loop + compaction/persistence logic)
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/core/session.ts` (session persistence)
- UX/UI:
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/ui/App.tsx` (global input handlers: Esc, Ctrl+C, etc.)
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/ui/components/Input.tsx` (input editing + key detection)
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/ui/components/PermissionPrompt.tsx` (permission dialog)
- MCP:
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/mcp/**`
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/tools/mcp.ts` (tool integration)
- Skills + plugins:
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/tools/skill.ts`
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/plugins/**`
- Platform/sandbox:
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/utils/platform.ts` (terminal title + sandbox capability detection, etc.)
  - `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/sandbox/**`

Evidence (entrypoint wiring): in `src/cli.ts`, the CLI imports core loop, tools, plugins, and MCP cleanup:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/cli.ts
import { ConversationLoop } from './core/loop.js'
import { toolRegistry } from './tools/index.js'
import { createPluginCommand } from './plugins/cli.js'
import { resetTerminalTitle } from './utils/platform.js'
import { disconnectAllMcpServers } from './tools/mcp.js'
```

## 2) Feature cross-check matrix (open-main vs official sources)

### 2.1) Large tool outputs persisted to disk (`<persisted-output>…</persisted-output>`)

Open-main defines the same protocol markers and sizes:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/core/loop.ts
const PERSISTED_OUTPUT_START = '<persisted-output>'
const PERSISTED_OUTPUT_END = '</persisted-output>'
const OUTPUT_THRESHOLD = 400000 // 400KB
const PREVIEW_SIZE = 2000 // 2KB
```

Open-main wraps large outputs into a preview block (but does **not** show a “Full output saved to:” filepath in this wrapper):

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/core/loop.ts
let result = `${PERSISTED_OUTPUT_START}\n`
result += `Preview (first ${PREVIEW_SIZE} bytes):\n`
result += preview
result += hasMore ? '\n...\n' : '\n'
result += PERSISTED_OUTPUT_END
```

Official evidence:

- **CONFIRMED (CHANGELOG)**: “Changed large tool outputs to be persisted to disk…” (`docs/research/reference/changelog.lines.md:75`) and “Changed large bash command outputs to be saved to disk…” (`docs/research/reference/changelog.lines.md:74`).
- **CONFIRMED (cli.js)**: cli.js contains the exact markers and the disk-save + preview template:

```js
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code/node_modules/@anthropic-ai/claude-code/cli.js
// (search needle: "<persisted-output>" / "Full output saved to:")
Q = `${pG1}\n`
Q += `Output too large (${gI(A.originalSize)}). Full output saved to: ${A.filepath}\n\n`
Q += `Preview (first ${gI(j92)}):\n`
```

And cli.js defines the same marker constants and a `400000`-ish threshold constant nearby:

```js
// (search needle: 'pG1="<persisted-output>"' and '_92=400000')
var DX0="tool-results",pG1="<persisted-output>",KX0="</persisted-output>",...;
var IX0=4,_92=400000,...; ... function cG1(){return ... ( ... ,DX0)}
```

Assessment:

- **CONFIRMED**: official uses `<persisted-output>…</persisted-output>`, persists full output to disk, and provides a preview.
- **PARTIAL**: open-main matches the markers/threshold/preview-size, but the shown wrapper code does not include the “full output saved to” filepath messaging, implying it may not implement the full persisted-output protocol end-to-end (needs deeper tracing to confirm file writes).

### 2.2) MCP `list_changed` notifications

Open-main handles `notifications/tools/list_changed` only:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/mcp/auto-discovery.ts
if (message.method === 'notifications/tools/list_changed') {
  this.discoverCapabilities(name)
}
```

Official evidence:

- **CONFIRMED (CHANGELOG)**: “Added support for MCP `list_changed` notifications… tools, prompts, and resources…” (`docs/research/reference/changelog.lines.md:105`).
- **CONFIRMED (cli.js)**: cli.js contains all three notification method strings:

```js
// cli.js search needles:
// "notifications/tools/list_changed"
// "notifications/resources/list_changed"
// "notifications/prompts/list_changed"
```

Assessment:

- **PARTIAL**: open-main seems to implement only the “tools” variant; official supports tools + prompts + resources.

### 2.3) Nested `.claude/skills` discovery (monorepo/subdir workflows)

Open-main implements a recursive scan for nested `.claude/skills` directories:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/tools/skill.ts
function discoverNestedSkillsDirectories(
  rootDir: string,
  maxDepth: number = 3,
): string[] {
  // ... scans subdirectories, detects entry.name === '.claude', then checks `.claude/skills`
}
```

Official evidence:

- **CONFIRMED (CHANGELOG)**: “Added automatic discovery of skills from nested `.claude/skills` directories…” (`docs/research/reference/changelog.lines.md:8`).
- **CONFIRMED (cli.js)**: onboarding/try-it strings reference `.claude/skills/...`:

```js
// cli.js (search needle: "Create .claude/skills/myskill/SKILL.md")
tryItPrompt: 'Create .claude/skills/myskill/SKILL.md'
```

Assessment:

- **CONFIRMED at the feature level** (nested skill discovery exists officially).
- Implementation details in open-main are plausible but still **UNCONFIRMED** as an exact match.

### 2.4) Terminal title on startup (“Claude Code”)

Open-main sets terminal title and gates it behind an env var:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/utils/platform.ts
if (process.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE) return
process.stdout.write(`\\x1B]0;${fullTitle}\\x07`)
export function resetTerminalTitle(): void {
  setTerminalTitleSuffix('Claude Code')
}
```

Official evidence:

- **CONFIRMED (CHANGELOG)**: “Changed terminal title to "Claude Code" on startup…” (`docs/research/reference/changelog.lines.md:27`).
- **CONFIRMED (cli.js)**: cli.js contains both the env var and the same OSC title sequence:

```js
// cli.js (search needle: "CLAUDE_CODE_DISABLE_TERMINAL_TITLE")
if(n1(process.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE))return;
... process.stdout.write(`\\x1B]0;${B}\\x07`)
```

Assessment: **CONFIRMED** (open-main matches a real official mechanism).

### 2.5) Statusline context window fields (`context_window.used_percentage`)

Open-main’s `StatuslineContext` defines `context_window.current_usage` + `context_window_size`, but does **not** define `used_percentage` / `remaining_percentage` fields:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/agents/statusline.ts
context_window: {
  // ...
  context_window_size: number;
  current_usage: { ... } | null;
};
```

Official evidence:

- **CONFIRMED (CHANGELOG)**: “Added `context_window.used_percentage` and `context_window.remaining_percentage` fields…” (`docs/research/reference/changelog.lines.md:9`).
- **CONFIRMED (cli.js)**: cli.js help text references `jq '.context_window.used_percentage'`:

```text
// cli.js (search needle: "context_window.used_percentage")
used=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
```

Assessment: open-main appears **behind** official 2.1.6 statusline schema here; do not rely on it for statusline parity.

### 2.6) Shift+Tab behavior (mode cycling, plan mode, auto-accept)

Open-main implements Shift+Tab handling in multiple places, with conflicting/unverified “official behavior” comments:

- Input layer cycles modes:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/ui/components/Input.tsx
// 循环切换：default → acceptEdits → plan → default
if ((key.tab && key.shift) || isShiftTab(input)) {
  const nextMode =
    permissionMode === 'default'
      ? 'acceptEdits'
      : permissionMode === 'acceptEdits'
        ? 'plan'
        : 'default'
  onPermissionModeChange(nextMode)
}
```

- Permission prompt claims “single vs double Shift+Tab” and auto-applies decisions immediately:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/ui/components/PermissionPrompt.tsx
// 官方 v2.1.2: 一次 Shift+Tab = Auto-Accept Edits, 两次 = Plan Mode
const SHIFT_TAB_DOUBLE_PRESS_INTERVAL = 500
```

Official evidence:

- **CONFIRMED (CHANGELOG)**: “Added Shift+Tab keyboard shortcut in plan mode to quickly select "auto-accept edits" option” (`docs/research/reference/changelog.lines.md:61`).
- **CONFIRMED (cli.js)**: keymap binds Shift+Tab to `chat:cycleMode`:

```js
// cli.js (search needle: 'shift+tab":"chat:cycleMode')
bindings:{escape:"chat:cancel","shift+tab":"chat:cycleMode",...}
```

- **CONFIRMED (cli.js)**: onboarding/try-it prompt explicitly says:

```js
// cli.js (search needle: "Press Shift+Tab once for Auto-Accept")
tryItPrompt: 'Press Shift+Tab once for Auto-Accept'
```

- **CONFIRMED (cli.js)**: the mode cycle order is implemented as a pure “next mode” function:

```js
// cli.js (search needle: 'function Dp2(')
function Dp2(A, Q) {
  let B = Q && null?.isTeamLead(Q)
  switch (A.mode) {
    case 'default':
      return 'acceptEdits'
    case 'acceptEdits':
      return 'plan'
    case 'plan':
      if (B) return 'delegate'
      return A.isBypassPermissionsModeAvailable
        ? 'bypassPermissions'
        : 'default'
    case 'delegate':
      return A.isBypassPermissionsModeAvailable
        ? 'bypassPermissions'
        : 'default'
    case 'bypassPermissions':
      return 'default'
    case 'dontAsk':
      return 'default'
  }
}
```

- **CONFIRMED (cli.js)**: `chat:cycleMode` uses that function, writes the new mode to a session destination, and explicitly tags `acceptEdits` as “auto-accept-mode”:

```js
// cli.js (search needle: '"chat:cycleMode":v1' and 'P0==="acceptEdits"')
v1=...useCallback(()=>{let P0=Dp2(B,EA.teamContext);
  ...
  if(P0==="acceptEdits")P9("auto-accept-mode");
  let MQ=eX(B,{type:"setMode",mode:P0,destination:"session"});
  ...
},...)
```

- **CONFIRMED (cli.js)**: there is also a _separate_ Confirmation context binding: `shift+tab` → `confirm:cycleMode`, which selects the `accept-session` option:

```js
// cli.js (search needle: 'shift+tab":"confirm:cycleMode' and 'mD({"confirm:cycleMode":f')
bindings:{...,"shift+tab":"confirm:cycleMode"}
...
let f=...useCallback(()=>{let y=x.find((c)=>c.option.type==="accept-session");if(y){let c=J(G.input);u(y.option,c)}},...);
mD({"confirm:cycleMode":f},{context:"Confirmation"});
```

Assessment:

- open-main’s “cycle mode” concept aligns with official `chat:cycleMode`, and cli.js provides a concrete mode cycle order: `default → acceptEdits → plan → (delegate|bypassPermissions|default) → default ...` depending on team-lead + bypass availability.
- open-main’s time-window **double-press** detection in `PermissionPrompt.tsx` is **not** reflected by the official cli.js evidence above; the “press twice to reach plan mode” outcome can be explained by the official single-press cycle (`default → acceptEdits → plan`) rather than a dedicated double-press mechanic.
- Practical implication for Kode parity: implement Shift+Tab as a deterministic per-press mode cycle (and separately handle Confirmation’s `confirm:cycleMode` behavior), not as a time-based double-press detector.

### 2.7) Shift+Enter multi-line input (terminal behavior)

Open-main claims Shift+Enter “needs terminal config support”:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/ui/components/Input.tsx
// 需要终端配置支持（详见 /terminal-setup 命令）
```

Official evidence:

- **CONFIRMED (CHANGELOG)**: “Changed Shift+Enter to work out of the box in iTerm2, WezTerm, Ghostty, and Kitty without modifying terminal configs” (`docs/research/reference/changelog.lines.md:87`).

Assessment: open-main’s commentary is at least **incomplete** relative to the official changelog; treat open-main’s Shift+Enter implementation as a candidate only.

### 2.8) Esc semantics (queued prompts vs cancel)

Open-main’s global Esc handler aborts the loop when processing:

```ts
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main/src/ui/App.tsx
if (key.escape) {
  if (isProcessing) {
    loop.abort()
    setIsProcessing(false)
    // ...
    return
  }
}
```

Official evidence:

- **CONFIRMED (CHANGELOG)**: “Fixed Esc key with queued prompts to only move them to input without canceling the running task” (`docs/research/reference/changelog.lines.md:93`).

Assessment: open-main does not (in this excerpt) reflect the queued-prompts nuance; treat as **UNCONFIRMED** and re-check against official cli.js before implementing parity in Kode.

## 3) Takeaways for Kode parity work (what open-main is good for)

- Use open-main to quickly locate _likely_ implementation regions:
  - persisted tool-result protocol: `src/core/loop.ts`
  - keyboard handling: `src/ui/components/Input.tsx`, `src/ui/App.tsx`, `src/ui/utils/kitty-keyboard.ts`
  - nested skills discovery: `src/tools/skill.ts`
  - MCP notification routing: `src/mcp/auto-discovery.ts`
  - terminal title + environment gates: `src/utils/platform.ts`
- But treat all open-main “official version” comments as **hypotheses**; due to version inconsistencies and observed partial coverage (e.g., MCP list_changed variants), the changelog + official `cli.js` must be the final authority.
