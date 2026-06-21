# `claude-code-open-main` — keybindings & terminal-input handling (candidate spec)

Scope: this document is derived **only** from `/Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code-open-main` (community code). It is **not** an official spec. Every behavior here is a _candidate_ to be corroborated against official sources in CCSRC004/CCSRC005/CCSRC006.

## 0) Input/event handling layers (observed)

Open-main routes “keyboard behavior” through multiple layers:

1. **Raw terminal escape detection** (Kitty keyboard protocol + legacy sequences) in `src/ui/utils/kitty-keyboard.ts`
2. **Global keybindings** via Ink `useInput` in `src/ui/hooks/useGlobalKeybindings.ts` (Ctrl+O/T/S/… and Ctrl+B backgrounding, Ctrl+G external editor, etc.)
3. **Prompt input editor** via Ink `useInput` in `src/ui/components/Input.tsx` (Shift+Enter newline, Shift+Tab mode cycle, Ctrl+R history search, ESC clear/double-ESC rewind, history up/down, etc.)
4. **App-level global overrides** in `src/ui/App.tsx` (Ctrl+C exit, `?` shortcut panel, ESC aborts running loop)
5. **Permission prompt key handling** in `src/ui/components/PermissionPrompt.tsx` (y/n/s/A/N, plus a custom Shift+Tab double-press mode)

## 1) Terminal escape sequences (Kitty protocol + legacy)

### 1.1 Kitty CSI-u parser (candidate)

- Kitty CSI-u format regex: `^\x1b\[(\d+)(?:;(\d+))?u` (`src/ui/utils/kitty-keyboard.ts:27`)
- Modifier decoding (modifiers are 1-based; mask uses `modifiers - 1`): (`src/ui/utils/kitty-keyboard.ts:34-47`)
- Special mapping table covers:
  - Standard control keys (`tab`, `return`, `escape`, `backspace`)
  - Kitty keypad keycodes `57399..57415` (0-9, operators, KP Enter)
  - Arrow keys (`left/right/up/down`) as function keys
  - F1-F35 (`src/ui/utils/kitty-keyboard.ts:53-137`)

### 1.2 Explicit special sequences used elsewhere

`src/ui/utils/kitty-keyboard.ts` defines explicit sequences and helper detectors:

| User intent                     | Sequence(s)                              | Helper                         | Source                                   |
| ------------------------------- | ---------------------------------------- | ------------------------------ | ---------------------------------------- |
| Shift+Enter (multi-line)        | `\x1b[13;2u` (Kitty) / `\x1b\r` (legacy) | `isShiftEnter(input)`          | `src/ui/utils/kitty-keyboard.ts:322-374` |
| Shift+Tab                       | `\x1b[9;2u` (Kitty) / `\x1b[Z` (legacy)  | `isShiftTab(input)`            | `src/ui/utils/kitty-keyboard.ts:331-398` |
| Enable Kitty keyboard protocol  | `\x1b[>1u` / `\x1b[>31u`                 | `KITTY_KEYBOARD.ENABLE(_FULL)` | `src/ui/utils/kitty-keyboard.ts:281-317` |
| Disable Kitty keyboard protocol | `\x1b[<u`                                | `KITTY_KEYBOARD.DISABLE`       | `src/ui/utils/kitty-keyboard.ts:294-317` |

Notes:

- `supportsEnhancedKeyboard()` checks `TERM_PROGRAM` and `TERM` for `kitty`, `wezterm`, `ghostty`, `iterm.app` (`src/ui/utils/kitty-keyboard.ts:243-265`).

## 2) Global keybindings (useGlobalKeybindings)

Open-main defines a builtin keybinding list in `src/ui/hooks/useGlobalKeybindings.ts` and matches key events via Ink’s `useInput`.

### 2.1 Built-in bindings

| Combo   | Action (handler)                              | Enabled/guards                     | Source                                         |
| ------- | --------------------------------------------- | ---------------------------------- | ---------------------------------------------- |
| Ctrl+O  | Toggle verbose output (`onVerboseToggle`)     | none                               | `src/ui/hooks/useGlobalKeybindings.ts:70-76`   |
| Ctrl+T  | Show/hide todos (`onTodosToggle`)             | none                               | `src/ui/hooks/useGlobalKeybindings.ts:77-83`   |
| Ctrl+S  | “Stash current prompt” (`onStashPrompt`)      | captures `getCurrentInput()`       | `src/ui/hooks/useGlobalKeybindings.ts:84-94`   |
| Ctrl+\_ | Undo last input (`onUndo`)                    | none                               | `src/ui/hooks/useGlobalKeybindings.ts:95-101`  |
| Ctrl+Z  | Suspend process (`SIGTSTP`) (non-win32)       | `process.platform !== 'win32'`     | `src/ui/hooks/useGlobalKeybindings.ts:102-114` |
| Ctrl+M  | Switch model (`onModelSwitch`)                | none                               | `src/ui/hooks/useGlobalKeybindings.ts:115-121` |
| Alt+P   | Switch model (`onModelSwitch`)                | none                               | `src/ui/hooks/useGlobalKeybindings.ts:122-128` |
| Alt+T   | Toggle extended thinking (`onThinkingToggle`) | none                               | `src/ui/hooks/useGlobalKeybindings.ts:129-135` |
| Ctrl+B  | Background current task (`onBackgroundTask`)  | `!isBackgroundTasksDisabled()`     | `src/ui/hooks/useGlobalKeybindings.ts:136-143` |
| Ctrl+G  | Open external editor                          | async; sets editorError on failure | `src/ui/hooks/useGlobalKeybindings.ts:144-177` |

Matching logic notes (candidate):

- Keybinding match requires exact modifier shape; e.g., if a binding does **not** declare `ctrl`, `matchKeybinding` requires `!key.ctrl` for it to match (`src/ui/hooks/useGlobalKeybindings.ts:187-203`).
- Global keybindings handler short-circuits if `disabled || isProcessing` (`src/ui/hooks/useGlobalKeybindings.ts:206-223`).

### 2.2 App wiring for global bindings (candidate)

`src/ui/App.tsx` calls `useGlobalKeybindings()` and uses its callbacks to mutate UI state; notably it passes `disabled: false` with a comment implying Ctrl+B should work even while processing:

```ts
// src/ui/App.tsx:360-426
useGlobalKeybindings({ ..., onBackgroundTask: () => { if (isProcessing) setShouldMoveToBackground(true); ... }, disabled: false });
```

## 3) Prompt input editor behaviors (Input.tsx)

`src/ui/components/Input.tsx` owns text-editing behavior, completion list navigation, history navigation, and several modal sub-states.

### 3.1 Multi-line input (Shift+Enter)

Candidate behavior:

- If `isShiftEnter(input) || (input === '\x1b' && key.return)`, insert `\n` at cursor instead of submit (`src/ui/components/Input.tsx:386-399`).

### 3.2 Shift+Tab mode cycling (permissionMode)

Candidate behavior:

- If `(key.tab && key.shift) || isShiftTab(input)`, compute `nextMode` from current `permissionMode` and call `onPermissionModeChange(nextMode)` (`src/ui/components/Input.tsx:401-414`).
- The code comment describes a cycle `default → acceptEdits → plan → default` (`src/ui/components/Input.tsx:401-410`).

### 3.3 Reverse history search (Ctrl+R) mode

Candidate behavior:

- Enter reverse-search mode: `if (key.ctrl && input === 'r' && !reverseSearchMode)` then initializes matches (`src/ui/components/Input.tsx:474-483`).
- While in reverse-search mode (`reverseSearchMode === true`):
  - Esc exits search and restores original value (`src/ui/components/Input.tsx:418-427`)
  - Enter selects current match and exits (`src/ui/components/Input.tsx:429-441`)
  - Ctrl+R cycles next match (`src/ui/components/Input.tsx:443-449`)
  - Ctrl+S cycles previous match (`src/ui/components/Input.tsx:451-457`)
  - Backspace/delete removes last query char (`src/ui/components/Input.tsx:459-463`)
  - Any other printable input appends to search query (when not ctrl/meta) (`src/ui/components/Input.tsx:465-469`)

### 3.4 Completion list navigation (when visible)

Candidate behavior (only when `showCompletionList && !vimNormalMode`):

- Up/down arrow changes `selectedCompletionIndex` (`src/ui/components/Input.tsx:485-498`)
- Tab or Enter applies selected completion (`src/ui/components/Input.tsx:499-545`)
  - Special case: when completion type is `command` and user pressed Enter, it applies completion and submits immediately (also ends IME composition first) (`src/ui/components/Input.tsx:513-531`)

### 3.5 Esc behavior inside input (clear vs rewind; non-vim path)

Candidate behavior (non-vim path):

- If `!vimModeEnabled && key.escape`, it checks the time delta since last Esc; if within `DOUBLE_PRESS_INTERVAL` and `onRewindRequest` exists, it calls rewind; otherwise it clears the current input buffer (`src/ui/components/Input.tsx:1000-1017`).

### 3.6 Submit + history persistence

Candidate behavior:

- Enter submits when `value.trim()` is non-empty; it calls `onSubmit(trimmedValue)`, then `historyManager.addCommand(trimmedValue)`, pushes it into `history`, clears value/cursor/historyIndex (`src/ui/components/Input.tsx:1020-1037`).

### 3.7 Cursor navigation + basic readline-style edits

Candidate behavior:

- Left/right arrow: cursor moves (`src/ui/components/Input.tsx:1044-1047`)
- Up/down arrow (when no completion list): navigate history (up increases historyIndex, down decreases; down from index 0 clears input) (`src/ui/components/Input.tsx:1048-1067`)
- Ctrl+A / Ctrl+E: move to start/end (`src/ui/components/Input.tsx:1068-1073`)
- Ctrl+U: clear to start (keep tail) (`src/ui/components/Input.tsx:1074-1079`)
- Ctrl+K: clear to end (keep head) (`src/ui/components/Input.tsx:1080-1083`)

## 4) App-level global keys (App.tsx)

App also registers its own `useInput` handler in addition to `useGlobalKeybindings`:

| Combo  | Effect                                                        | Condition                                | Source                   |
| ------ | ------------------------------------------------------------- | ---------------------------------------- | ------------------------ |
| Ctrl+C | `exit()`                                                      | always                                   | `src/ui/App.tsx:429-432` |
| `?`    | toggle shortcuts panel                                        | only when `!isProcessing`                | `src/ui/App.tsx:433-436` |
| Esc    | abort running loop (`loop.abort()`), set `isProcessing` false | only when `isProcessing`                 | `src/ui/App.tsx:438-460` |
| Esc    | closes shortcuts/welcome panels                               | only when not processing (falls through) | `src/ui/App.tsx:461-464` |

Note: this App-level Esc “abort” behavior can conflict with Input’s own Esc-clear/double-Esc-rewind behavior; open-main appears to rely on “isProcessing” gating to decide which behavior applies.

## 5) Permission prompt keys (PermissionPrompt.tsx)

Permission prompt advertises shortcut keys (candidate) and adds its own Shift+Tab logic:

- Shortcut keys are surfaced via option objects containing `key: 'y' | 'n' | 's' | 'A' | 'N'` (`src/ui/components/PermissionPrompt.tsx:113-153`).
- Open-main defines a “double Shift+Tab” detection interval and claims a mapping (“once = accept edits; twice = plan mode”) (`src/ui/components/PermissionPrompt.tsx:77-80`).
- The `handleShiftTab()` implementation immediately calls `onDecision(...)` on first press (acceptEdits) and on second press (plan), with `scope: 'session'` (`src/ui/components/PermissionPrompt.tsx:155-194`).

## 6) Known gaps / follow-ups (intentionally out of scope here)

- This is not an official spec; CCSRC004/005/006 must corroborate key behaviors (especially Esc semantics, Shift+Tab semantics, Shift+Enter “out of box” terminals).
- Input.tsx contains a large VIM-mode subsystem and additional bindings not enumerated here; they should be documented separately if Kode plans to support VIM parity.
