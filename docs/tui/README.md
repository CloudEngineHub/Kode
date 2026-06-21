# TUI Architecture (Ink v6 base)

Kode’s TUI uses **official upstream Ink** as the rendering core and implements all UX/perf/interaction features as **Kode-owned extensions** (no Ink forks).

## Layering

1. **Ink (upstream)**: layout + reconciliation + terminal rendering.
2. **Kode TUI “extensions”** (Ink host glue + cross-screen behavior):
   - `apps/cli/src/ui/utils/inkRender.ts`: centralized Ink `render()` defaults (screen reader, incremental rendering, max FPS, stdio).
   - `apps/cli/src/utils/stdio.ts`: output guards + optional terminal “synchronized output”.
   - `apps/cli/src/ui/contexts/KeypressContext.tsx`: single key event stream, handler priorities, batched updates.
   - `apps/cli/src/ui/primitives/layout/ScreenFrame.tsx`: consistent fullscreen framing + viewport-safe sizing.
3. **Screens** (product UI): `apps/cli/src/ui/screens/**` and `apps/cli/src/ui/components/**`.

Goal: contributors can ship new screens/components without needing to reason about terminal quirks, raw mode, render batching, or flicker fixes.

## Fullscreen Overlay Navigation (Multi-level pages)

Fullscreen overlays in the REPL are managed as a **stack** in:

- `apps/cli/src/ui/screens/REPL/useReplController.tsx`

Rules:

- `openToolView(view)` **pushes** a view onto the stack.
- `dismissToolView()` **pops** the top view (Esc “back one level”).
- Tool-host callbacks (`setToolJSX`) **replace** the stack (used for tool UIs / host-driven fullscreen views).

This avoids “Esc sometimes returns to home” when opening a page from inside another fullscreen page (e.g. Command Palette → Config).

## Render Performance / Flicker Guardrails

**1) Never overflow the viewport**

- Prefer `ScreenFrame` for fullscreen screens; it enforces a safe height and hides overflow.

**2) Batch state updates per keypress**

- `KeypressContext` batches updates so one keypress doesn’t cause multiple intermediate frames.

**3) Prefer incremental rendering (Ink v6)**

- Config: `incrementalRendering` (restart required).
- Env override: `KODE_TUI_INCREMENTAL_RENDERING=0|1` (wins over config).

**4) Optional terminal synchronized output**

- Enabled by default for TTY (can reduce visible tearing during redraw).
- Env override: `KODE_SYNC_OUTPUT=0|false` to disable.

## Screen Reader / Accessibility

- Env: `KODE_SCREEN_READER=1` (or `SCREENREADER=1`) disables features that can harm screen reader output (e.g. line wrap disabling, incremental rendering).

## Adding a New Fullscreen Overlay Screen

1. Create the screen in `apps/cli/src/ui/screens/overlays/<YourScreen>.tsx`.
2. Use `ScreenFrame` for layout.
3. Handle input via `useKeypress(..., { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY })`.
4. Wire it into `apps/cli/src/ui/screens/REPL/useReplController.tsx` via `openToolView({ jsx: <YourScreen onDone={dismissToolView} />, displayMode: 'fullscreen', shouldHidePromptInput: true })`.

## Dev commands

- `bun run typecheck`
- `bun test`
- `bun run build`
