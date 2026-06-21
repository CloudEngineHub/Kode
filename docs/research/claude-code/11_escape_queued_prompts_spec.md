# Esc + queued prompts — official evidence notes (CHANGELOG + cli.js)

Goal: capture **only what we can prove** from the official evidence set (`@anthropic-ai/claude-code@2.1.6`) about Esc behavior when prompts are queued.

## 1) Official CHANGELOG requirement (verbatim)

From the official changelog (line-indexed mirror at `docs/research/reference/changelog.lines.md`):

> - Fixed Esc key with queued prompts to only move them to input without canceling the running task (`docs/research/reference/changelog.lines.md:93`)

This is the minimum parity target for Kode.

## 2) Official keymap binding: `escape` → `chat:cancel`

The official obfuscated `cli.js` contains a keymap where Chat context maps Esc to `chat:cancel`:

```js
// /Users/baicai/Desktop/MyT/Kode/KodeOrch/other/1/claude-code/node_modules/@anthropic-ai/claude-code/cli.js
// (search needle: 'bindings:{escape:"chat:cancel"')
{context:"Chat",bindings:{escape:"chat:cancel",...}}
```

## 3) Official cancel handler references `queuedCommands` and `popCommandFromQueue`

In `cli.js`, `chat:cancel` is registered with a handler that explicitly inspects queued commands and can call a `popCommandFromQueue` callback:

```js
// cli.js (search needle: 'function vN0({' and 'queuedCommands' and 'popCommandFromQueue')
function vN0({setToolUseConfirmQueue:A,onCancel:Q,screen:G,abortSignal:Z,popCommandFromQueue:Y,...}){
  let[{queuedCommands:K}]=s0(),
    V=...useCallback(()=>{
      if(Z!==void 0 && !Z.aborted){ /* cancel path */ A(()=>[]); Q(); return }
      if(K.length>0){ if(Y){ Y(); return } }
      /* default cancel */ A(()=>[]); Q()
    },...);
  return A2("chat:cancel",V,{context:"Chat",isActive:...}),A2("app:interrupt",V,{context:"Global",isActive:...}),null
}
```

Provable facts from the excerpt:

- There is a first-class `queuedCommands` array in app state (`let[{queuedCommands:K}]=s0()`).
- The cancel handler has a branch that calls `popCommandFromQueue()` when `queuedCommands.length > 0` (and a pop callback is provided).

## 4) Official pop implementation moves queued content into the prompt input

The same `cli.js` contains a call site wiring `popCommandFromQueue` to an implementation that:

- uses `$Z1(...)` (a helper that reads and filters queued commands),
- writes the resulting text into the prompt input (`r9(d1.text)`),
- switches UI back to the prompt screen (`z5("prompt")`),
- and carries over any queued images into state.

```js
// cli.js (search needle: 'popCommandFromQueue:i5' and '$Z1(' and 'z5(\"prompt\")')
let i5=...useCallback(async()=>{
  let d1=await $Z1(...);
  if(!d1)return;
  if(r9(d1.text), z5("prompt"), d1.images.length>0) ...
},...);
...
{ ..., abortSignal: U1?.signal, popCommandFromQueue: i5, ... }
```

## 5) What we can and cannot conclude (no guessing)

What is **confirmed by evidence**:

- Official code has explicit concepts for `queuedCommands` and for “popping” queued commands into the input buffer.
- `chat:cancel` (Esc) has a queue-aware branch that can call `popCommandFromQueue()`.

What is **not provable from the excerpts above** (needs deeper tracing in cli.js):

- The exact runtime precedence when _both_ a running task (abortSignal present) and queued prompts exist. In the shown handler, the abort-signal cancel branch runs before the queue branch; whether the abortSignal is deliberately omitted/disabled in the “queued prompt while running” scenario cannot be concluded without tracing how `abortSignal` is managed when commands are queued.

Therefore, for Kode parity work we should treat the CHANGELOG line as the behavioral spec, and treat the cli.js evidence above as proof that the official implementation has a dedicated “queue → input” path (even if the full precedence logic needs more extraction).
