# Claude Code runtime specs — sessions, persistence, permissions, sandbox (evidence-based)

- Claude package root: `<CLAUDE_CODE_PKG_ROOT>`
- Claude `cli.js`: `<CLAUDE_CODE_PKG_ROOT>/cli.js` (sha256: `b34653bf5caebdafe4d8baed2997166b5e9bb787a87dcc37a262d2ef649b98ea`, package version: `2.1.6`)

This document converts `cli.js` into “behavior specs”: **Behavior → Evidence → Implication for Kode alignment**. Any item that cannot be proven from static evidence is explicitly labeled **UNKNOWN** with a verification plan.

## R1) Data roots (where Claude Code writes)

### R1.1 Config root (`~/.claude` by default)

**Behavior**

- Claude Code chooses a single “config root” directory, defaulting to `~/.claude`, overridable via `CLAUDE_CONFIG_DIR`.

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:9`

```js
function FQ() {
  return process.env.CLAUDE_CONFIG_DIR ?? u_9(m_9(), '.claude')
}
```

**Implication (Kode)**

- If Kode aims to be `.claude`-compatible, the equivalent of `~/.kode` should have a compatibility mode that can also honor `CLAUDE_CONFIG_DIR` semantics (while keeping Kode-first precedence).

### R1.2 Plan file root (`~/.claude/plans`)

**Behavior**

- Claude Code stores plan files under `<configRoot>/plans`, creating the directory if missing.

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:1682`

```js
function GN() {
  let A = TSA(FQ(), 'plans')
  if (!yA().existsSync(A))
    try {
      yA().mkdirSync(A)
    } catch (Q) {
      e(Q instanceof Error ? Q : Error(String(Q)))
    }
  return A
}
```

**Implication (Kode)**

- Kode should decide whether it mirrors this layout (`<configRoot>/plans`) or provides an interop layer for reading/writing plan files when running in a Claude-compat mode.

### R1.3 Debug logs root (`~/.claude/debug/<sessionId>.txt` by default)

**Behavior**

- Claude Code writes debug logs to `<configRoot>/debug/<sessionId>.txt` by default (or `CLAUDE_CODE_DEBUG_LOGS_DIR` override).
- It also attempts to maintain a symlink `<configRoot>/debug/latest` → the current session log file (except when argv[2] is `--ripgrep`).

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:11`

```js
function FCA() {
  return (
    process.env.CLAUDE_CODE_DEBUG_LOGS_DIR ?? bb0(FQ(), 'debug', `${U0()}.txt`)
  )
}
```

```js
l_9 = D0(() => {
  if (process.argv[2] === '--ripgrep') return
  try {
    let A = FCA(),
      Q = gU1(A),
      B = bb0(Q, 'latest')
    if (!yA().existsSync(Q)) yA().mkdirSync(Q)
    if (yA().existsSync(B))
      try {
        yA().unlinkSync(B)
      } catch {}
    yA().symlinkSync(A, B)
  } catch {}
})
```

**Implication (Kode)**

- A `~/.kode/debug/latest` symlink (or equivalent) is a high-UX-value affordance for “where are the logs for _this_ session?”.

### R1.4 OS cache roots for errors/messages/mcp-logs (per project)

**Behavior**

- Claude Code uses an OS-specific “app directories” resolver (`Jq1("claude-cli")`) to derive a cache root (with default suffix `-nodejs`).
- Under the derived cache root, it creates per-project subtrees keyed by a sanitized `cwd()`, and within that:
  - `errors/`
  - `messages/`
  - `mcp-logs-<server>/`

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:12` (resolver; note `cache:` mapping)

```js
function Jq1(A, { suffix: Q = 'nodejs' } = {}) {
  if (typeof A !== 'string')
    throw TypeError(`Expected a string, got ${typeof A}`)
  if (Q) A += `-${Q}`
  if (Zq1.platform === 'darwin') return IP9(A)
  if (Zq1.platform === 'win32') return WP9(A)
  return DP9(A)
}
var ql,
  Yq1,
  n5A,
  IP9 = A => {
    let Q = pX.join(ql, 'Library')
    return {
      data: pX.join(Q, 'Application Support', A),
      config: pX.join(Q, 'Preferences', A),
      cache: pX.join(Q, 'Caches', A),
      log: pX.join(Q, 'Logs', A),
      temp: pX.join(Yq1, A),
    }
  },
  WP9 = A => {
    let Q = n5A.APPDATA || pX.join(ql, 'AppData', 'Roaming'),
      B = n5A.LOCALAPPDATA || pX.join(ql, 'AppData', 'Local')
    return {
      data: pX.join(B, A, 'Data'),
      config: pX.join(Q, A, 'Config'),
      cache: pX.join(B, A, 'Cache'),
      log: pX.join(B, A, 'Log'),
      temp: pX.join(Yq1, A),
    }
  },
  DP9 = A => {
    let Q = pX.basename(ql)
    return {
      data: pX.join(n5A.XDG_DATA_HOME || pX.join(ql, '.local', 'share'), A),
      config: pX.join(n5A.XDG_CONFIG_HOME || pX.join(ql, '.config'), A),
      cache: pX.join(n5A.XDG_CACHE_HOME || pX.join(ql, '.cache'), A),
      log: pX.join(n5A.XDG_STATE_HOME || pX.join(ql, '.local', 'state'), A),
      temp: pX.join(Yq1, Q, A),
    }
  }
```

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:12` (cache subpaths)

```js
function zh0(A) {
  return A.replace(/[^a-zA-Z0-9]/g, '-')
}
function SdA(A) {
  return zh0(A)
}
var PdA, Nl
var NCA = w(() => {
  Eh0()
  WQ()
  PdA = Jq1('claude-cli')
  Nl = {
    baseLogs: () => TdA(PdA.cache, SdA(yA().cwd())),
    errors: () => TdA(PdA.cache, SdA(yA().cwd()), 'errors'),
    messages: () => TdA(PdA.cache, SdA(yA().cwd()), 'messages'),
    mcpLogs: A => TdA(PdA.cache, SdA(yA().cwd()), `mcp-logs-${zh0(A)}`),
  }
})
```

**Implication (Kode)**

- Claude Code separates “conversation persistence” (`~/.claude/projects/**`) from “forensics logs” (OS cache). Kode should decide whether to keep the same split (and how to map Kode-first + Claude-compat).

### R1.5 Temp roots for background task output & scratchpad

**Behavior**

- Claude Code chooses a temp base directory:
  - `CLAUDE_CODE_TMPDIR` if set
  - else `tmpdir()` on Windows
  - else `/tmp`
- Then uses a fixed subdir `claude/` under that base, and a per-project subdir keyed by a sanitized project string.

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4730`

```js
function Z$A() {
  return y8('tengu_scratch')
}
function _q7() {
  let A =
    process.env.CLAUDE_CODE_TMPDIR || (CQ() === 'windows' ? Uq7() : '/tmp')
  return ke(A, 'claude') + fe
}
function s51() {
  return ke(_q7(), UGA(RQ())) + fe
}
```

**Implication (Kode)**

- If Kode supports background shells and wants Claude-like operability, it should stabilize an analogous `<tmpBase>/<product>/<projectKey>/tasks/<id>.output` convention (even if the “product” prefix is `kode`).

## R2) Session identity & project keying

### R2.1 Session ID generation

**Behavior**

- Session IDs are UUIDs generated from Node crypto `randomUUID`.

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:8`

```js
import { randomUUID as kk0 } from 'crypto'
```

```js
sessionId: kk0()
```

```js
function U0() {
  return u0.sessionId
}
```

### R2.2 Project key sanitization

**Behavior**

- Claude Code normalizes an identifier (commonly `cwd`-like values) by replacing any non-alphanumeric char with `-`.

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:75`

```js
function UGA(A) {
  return A.replace(/[^a-zA-Z0-9]/g, '-')
}
```

**Implication (Kode)**

- If Kode needs “same project key as Claude” compatibility, this exact sanitization rule (`/[^a-zA-Z0-9]/g → "-"`) is a key alignment anchor.

## R3) Session transcripts & persistence (`~/.claude/projects/**.jsonl`)

### R3.1 Path layout

**Behavior**

- Projects root: `<configRoot>/projects`
- Project directory: `<configRoot>/projects/<UGA(projectId)>`
- Session transcript file: `<configRoot>/projects/<UGA(projectId)>/<sessionId>.jsonl`
- Subagent sidechain transcript file: `<configRoot>/projects/<UGA(projectId)>/<sessionId>/subagents/agent-<agentId>.jsonl`

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4719`

```js
function Uc() {
  return Gw(FQ(), 'projects')
}
function BN() {
  return _O(U0())
}
function _O(A) {
  let Q = nK(ve)
  return Gw(Q, `${A}.jsonl`)
}
function wb(A) {
  let Q = nK(ve),
    B = U0()
  return Gw(Q, B, 'subagents', `agent-${A}.jsonl`)
}
function iz9(A) {
  let Q = nK(ve),
    B = Gw(Q, `${A}.jsonl`),
    G = yA()
  try {
    return (G.statSync(B), !0)
  } catch {
    return !1
  }
}
function Bq7() {
  return 'production'
}
function nz9() {
  return 'external'
}
function sp() {
  return !0
}
function nK(A) {
  return Gw(Uc(), UGA(A))
}
```

### R3.2 Record types in `.jsonl`

**Behavior**

- The `.jsonl` log contains multiple record “types” beyond user/assistant messages, including:
  - `summary`
  - `custom-title`
  - `tag`
  - `file-history-snapshot`
  - `attribution-snapshot`

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4730`

```js
async function wc(A) {
  let Q = new Map(),
    B = new Map(),
    G = new Map(),
    Z = new Map(),
    Y = new Map(),
    J = new Map()
  try {
    let W = await Zg(A)
    for (let D of W)
      if (
        D.type === 'user' ||
        D.type === 'assistant' ||
        D.type === 'attachment' ||
        D.type === 'system'
      )
        Q.set(D.uuid, D)
      else if (D.type === 'summary' && D.leafUuid) B.set(D.leafUuid, D.summary)
      else if (D.type === 'custom-title' && D.sessionId)
        G.set(D.sessionId, D.customTitle)
      else if (D.type === 'tag' && D.sessionId) Z.set(D.sessionId, D.tag)
      else if (D.type === 'file-history-snapshot') Y.set(D.messageId, D)
      else if (D.type === 'attribution-snapshot') J.set(D.messageId, D)
  } catch {}
  let X = new Set(
      [...Q.values()].map(W => W.parentUuid).filter(W => W !== null),
    ),
    I = new Set([...Q.keys()].filter(W => !X.has(W.uuid)))
  return {
    messages: Q,
    summaries: B,
    customTitles: G,
    tags: Z,
    fileHistorySnapshots: Y,
    attributionSnapshots: J,
    leafUuids: I,
  }
}
```

### R3.3 Message-chain insertion adds standardized metadata fields

**Behavior**

- When inserting a message chain, Claude Code augments entries with fields such as:
  - `userType` (e.g. `"external"`)
  - `cwd` (from `e1()`)
  - `sessionId`
  - `agentId`
  - `slug` (from `g5A().get(sessionId)`)
  - plus parent-linking fields `parentUuid` / `logicalParentUuid` / `isSidechain`

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4721`

```js
async insertMessageChain(A,Q=!1,B,G,Z){return this.trackWrite(async()=>{let Y=G??null,J;try{J=await Uu()}catch{J=void 0}let X=U0(),I=g5A().get(X);for(let W of A){let D=jp(W),K=Y;if(W.type==="user"&&"sourceToolAssistantUUID"in W&&W.sourceToolAssistantUUID)K=W.sourceToolAssistantUUID;let V={parentUuid:D?null:K,logicalParentUuid:D?Y:void 0,isSidechain:Q,...{},userType:nz9(),cwd:e1(),sessionId:X,version:{ISSUES_EXPLAINER:"report the issue at https://github.com/anthropics/claude-code/issues",PACKAGE_URL:"@anthropic-ai/claude-code",README_URL:"https://code.claude.com/docs/en/overview",VERSION:"2.1.6",FEEDBACK_CHANNEL:"https://github.com/anthropics/claude-code/issues",BUILD_TIME:"2026-01-13T01:42:19Z"}.VERSION,gitBranch:J,agentId:B,slug:I,...W};await this.appendEntry(V),Y=W.uuid}})}
```

**Implication (Kode)**

- If Kode stores transcripts, it should decide whether to embed the same “shape” (fields + names) for `.claude` interop, or implement a lossless mapping layer.

### R3.4 Persistence disable gates

**Behavior**

- `appendEntry(...)` can become a no-op if:
  - running in `"test"` (unless `TEST_ENABLE_SESSION_PERSISTENCE==="true"`)
  - settings `cleanupPeriodDays===0`
  - session persistence disabled flag `jAA()`

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4721`

```js
async appendEntry(A,Q=U0()){let B=process.env.TEST_ENABLE_SESSION_PERSISTENCE==="true";if(Bq7()==="test"&&!B||jQ()?.cleanupPeriodDays===0||jAA())return;
```

## R4) Tool result persistence (`tool-results/` + transcript placeholders)

### R4.1 Tool-result directory layout and naming

**Behavior**

- Tool results can be persisted as files under:
  - `<configRoot>/projects/<projectKey>/<sessionId>/tool-results/<tool_use_id>.json` (if content is array → JSON)
  - `<configRoot>/projects/<projectKey>/<sessionId>/tool-results/<tool_use_id>.txt` (otherwise)

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:1717`

```js
function _65() {
  return WX0(nK(RQ()), U0())
}
function cG1() {
  return WX0(_65(), DX0)
}
async function j65() {
  try {
    await O65(cG1(), { recursive: !0 })
  } catch {}
}
async function m9A(A, Q) {
  await j65()
  let B = Array.isArray(A),
    G = B ? 'json' : 'txt',
    Z = WX0(cG1(), `${Q}.${G}`),
    Y = B ? A1(A, null, 2) : A,
    J = !1
  try {
    ;(await R65(Z), (J = !0))
  } catch {}
  if (!J) {
    try {
      await M65(Z, Y, 'utf-8')
    } catch (W) {
      let D = W instanceof Error ? W : Error(String(W))
      return (e(D), { error: x65(D) })
    }
    k(`Persisted tool result to ${Z} (${gI(Y.length)})`)
  }
  let { preview: X, hasMore: I } = S65(Y, j92)
  return {
    filepath: Z,
    originalSize: Y.length,
    isJson: B,
    preview: X,
    hasMore: I,
  }
}
```

### R4.2 Transcript placeholder strings

**Behavior**

- Claude Code uses a “persisted output” marker and an “old content cleared” marker.

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:1725`

```js
var DX0 = 'tool-results',
  pG1 = '<persisted-output>',
  KX0 = '</persisted-output>',
  VX0 = '[Old tool result content cleared]'
```

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:2824` + `:2826` (tool result rewrite)

```js
if(F.type==="user"){let H=[],E=!1;for(let z of F.message.content)if(z.type==="tool_result"&&K(z.tool_use_id)&&z.content&&!gi5(z.content)){E=!0;let $=VX0,O=await m9A(z.content,z.tool_use_id);if(!d9A(O))$=`${pG1}Tool result saved to: ${O.filepath}
```

```js
Use ${X3} to view${KX0}`;H.push({...z,content:$})}else H.push(z);
```

**Implication (Kode)**

- If Kode implements transcript compaction, a Claude-compatible placeholder format (including `<persisted-output>...</persisted-output>`) is a critical compatibility surface.

## R5) Background task output (`tasks/*.output`)

### R5.1 Output file path convention

**Behavior**

- Background task output files live under the per-project temp dir:
  - `<tmpBase>/claude/<projectKey>/tasks/<id>.output`

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:1682` (tasks output helpers)

```js
function PSA() {
  return _Z0(s51(), 'tasks')
}
function jZ0() {
  let A = PSA()
  if (!w9A(A)) CA2(A, { recursive: !0 })
}
function gY(A) {
  return _Z0(PSA(), `${A}.output`)
}
function L9A(A, Q) {
  try {
    jZ0()
    let Y = gY(A),
      J = ks8(Y)
    if (!w9A(J)) CA2(J, { recursive: !0 })
  } catch (Y) {
    e(Y instanceof Error ? Y : Error(String(Y)))
    return
  }
  let B = gY(A),
    Z = (EA2.get(A) ?? Promise.resolve()).then(async () => {
      try {
        await vs8(B, Q, 'utf8')
      } catch (Y) {
        e(Y instanceof Error ? Y : Error(String(Y)))
      }
    })
  EA2.set(A, Z)
}
function TZ0(A, Q) {
  try {
    let B = gY(A)
    if (!w9A(B)) return { content: '', newOffset: Q }
    let Z = Ss8(B).size
    if (Z <= Q) return { content: '', newOffset: Q }
    return { content: zA2(B, 'utf8').slice(Q), newOffset: Z }
  } catch (B) {
    return (
      e(B instanceof Error ? B : Error(String(B))),
      { content: '', newOffset: Q }
    )
  }
}
```

### R5.2 `.output` path is treated as a “special file” by the UI

**Behavior**

- Claude Code detects reads of `tasks/*.output` and extracts the task id from the filename; the UI can then show “Read agent output” rather than showing a literal path.

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:1682`

```js
function t51(A) {
  let Q = `${PSA()}/`,
    B = '.output'
  if (A.startsWith(Q) && A.endsWith('.output')) {
    let G = A.slice(Q.length, -7)
    if (G.length > 0 && G.length <= 20 && /^[a-zA-Z0-9_-]+$/.test(G)) return G
  }
  return null
}
```

**Implication (Kode)**

- This “special path” convention is a UX feature, not just storage. If Kode uses similar `.output` files, it should also make them readable and well-presented.

## R6) Permission system: prompts + allowlists

### R6.1 Default permission prompt strings

**Behavior**

- When permissions are missing, Claude Code generates consistent prompt strings for read/write/tool use.

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4730`

```js
typeof A.getPath!=="function")return{behavior:"ask",message:`Claude requested permissions to use ${A.name}, but you haven't granted it yet.`};
```

```js
K = iH(D, B, 'read', 'ask')
if (K)
  return {
    behavior: 'ask',
    message: `Claude requested permissions to read from ${G}, but you haven't granted it yet.`,
    decisionReason: { type: 'rule', rule: K },
  }
```

```js
K = iH(D, B, 'edit', 'ask')
if (K)
  return {
    behavior: 'ask',
    message: `Claude requested permissions to write to ${G}, but you haven't granted it yet.`,
    decisionReason: { type: 'rule', rule: K },
  }
```

### R6.2 Built-in allowlists for plan/scratchpad/session-memory/tool-results/temp

**Behavior**

- Claude Code explicitly allows:
  - writing the **current session plan file**
  - writing scratchpad files for current session (feature-flagged)
  - reading session-memory files for current session
  - reading project directory files under `~/.claude/projects/<projectKey>/`
  - reading tool result files under `tool-results/`
  - reading project temp directory files under `<tmpBase>/claude/<projectKey>/...`

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4730` (plan + session-memory + project directory roots)

```js
function H$9(A) {
  let Q = xC()
  return A === Q
}
function d$1() {
  return ke(nK(e1()), U0(), 'session-memory') + fe
}
function sfA() {
  return ke(d$1(), 'summary.md')
}
function Mq7(A) {
  return A.startsWith(d$1())
}
function Rq7(A) {
  let Q = nK(e1())
  return A === Q || A.startsWith(Q + fe)
}
```

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4730` (scratchpad dir + feature flag)

```js
function Z$A() {
  return y8('tengu_scratch')
}
function _q7() {
  let A =
    process.env.CLAUDE_CODE_TMPDIR || (CQ() === 'windows' ? Uq7() : '/tmp')
  return ke(A, 'claude') + fe
}
function s51() {
  return ke(_q7(), UGA(RQ())) + fe
}
function GC1() {
  return ke(s51(), U0(), 'scratchpad')
}
function E$9() {
  if (!Z$A()) throw Error('Scratchpad directory feature is not enabled')
  let A = yA(),
    Q = GC1()
  if (!A.existsSync(Q)) A.mkdirSync(Q)
  return Q
}
function z$9(A) {
  if (!Z$A()) return !1
  let Q = GC1()
  return A === Q || A.startsWith(Q + fe)
}
```

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4730` (allowlist decisions)

```js
function xq7(A, Q) {
  if (H$9(A))
    return {
      behavior: 'allow',
      updatedInput: Q,
      decisionReason: {
        type: 'other',
        reason: 'Plan files for current session are allowed for writing',
      },
    }
  if (z$9(A))
    return {
      behavior: 'allow',
      updatedInput: Q,
      decisionReason: {
        type: 'other',
        reason: 'Scratchpad files for current session are allowed for writing',
      },
    }
  return { behavior: 'passthrough', message: '' }
}
function EK0(A, Q) {
  if (Mq7(A))
    return {
      behavior: 'allow',
      updatedInput: Q,
      decisionReason: {
        type: 'other',
        reason: 'Session memory files are allowed for reading',
      },
    }
  if (Rq7(A))
    return {
      behavior: 'allow',
      updatedInput: Q,
      decisionReason: {
        type: 'other',
        reason: 'Project directory files are allowed for reading',
      },
    }
  if (H$9(A))
    return {
      behavior: 'allow',
      updatedInput: Q,
      decisionReason: {
        type: 'other',
        reason: 'Plan files for current session are allowed for reading',
      },
    }
  let B = cG1(),
    G = B.endsWith(fe) ? B : B + fe
  if (A === B || A.startsWith(G))
    return {
      behavior: 'allow',
      updatedInput: Q,
      decisionReason: {
        type: 'other',
        reason: 'Tool result files are allowed for reading',
      },
    }
  if (z$9(A))
    return {
      behavior: 'allow',
      updatedInput: Q,
      decisionReason: {
        type: 'other',
        reason: 'Scratchpad files for current session are allowed for reading',
      },
    }
  let Z = s51()
  if (A.startsWith(Z))
    return {
      behavior: 'allow',
      updatedInput: Q,
      decisionReason: {
        type: 'other',
        reason: 'Project temp directory files are allowed for reading',
      },
    }
  return { behavior: 'passthrough', message: '' }
}
```

**Implication (Kode)**

- This allowlist is a concrete “Claude baseline”: it avoids permission-prompt spam for internal artifacts while keeping security for user filesystem.
- Kode should align these semantics in its own permission engine, especially for plan/scratchpad/task-output/tool-result artifacts.

## R7) Sandbox violations are appended to stderr (and later stripped for display)

### R7.1 Stderr annotation format

**Behavior**

- When sandboxing is enabled and violations exist for a command, Claude Code appends a block to stderr:
  - starts with `<sandbox_violations>`
  - contains one violation line per entry
  - ends with `</sandbox_violations>`

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:418`

```js
function G88(A, Q) {
  if (!j3) return Q
  let B = W01.getViolationsForCommand(A)
  if (B.length === 0) return Q
  let G = Q
  G += co1 + '<sandbox_violations>' + co1
  for (let Z of B) G += Z.line + co1
  return ((G += '</sandbox_violations>'), G)
}
```

### R7.2 UI removal helpers

**Behavior**

- Claude Code strips the `<sandbox_violations>...</sandbox_violations>` block in some UI contexts.

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:1678`

```js
function a51(A) {
  return A.replace(/<sandbox_violations>[\s\S]*?<\/sandbox_violations>/g, '')
}
```

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:2778`

```js
function Al5(A) {
  if (!A.match(/<sandbox_violations>([\s\S]*?)<\/sandbox_violations>/))
    return { cleanedStderr: A }
  return { cleanedStderr: a51(A).trim() }
}
```

### R7.3 Bash tool integration point

**Behavior**

- The Bash tool explicitly annotates stderr with sandbox failures before throwing `ShellError` (or equivalent).

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:3219`

```js
let wA = WB.annotateStderrWithSandboxFailures(A.command, E.stderr || '')
if (V.isError) throw new hy(E.stdout, wA, E.code, E.interrupted)
```

**Implication (Kode)**

- If Kode has sandboxing, adopting the same “stderr side-channel” convention enables downstream tooling (and transcript readers) to reliably detect sandbox issues without inventing new formats.
- **Implemented (Kode)**: runtime appends a `<sandbox_violations>...</sandbox_violations>` block for tagged macOS sandbox-exec denials (lines containing `KODE_SANDBOX`) via `packages/runtime/src/shell/sandboxViolations.ts` (wired in `packages/runtime/src/shell/exec.ts`). The Ink renderer strips the block for user display in `packages/tools/src/tools/system/BashTool/BashToolResultMessage.tsx`, while leaving the raw stderr intact for assistant analysis.

## R8) Error logs, naming, retention/cleanup

### R8.1 Error log filenames are timestamp-based `.jsonl`

**Behavior**

- Claude Code formats timestamps by replacing `:` and `.` with `-` for filenames.
- It uses `Nl.errors()` (OS cache) and a timestamp `Nq9` to generate `*.jsonl` file paths.

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:12`

```js
function $h0(A) {
  return A.toISOString().replace(/[:.]/g, '-')
}
```

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4989`

```js
Nq9 = $h0(new Date())
```

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4988`

```js
function wq9() {
  return qq9(Nl.errors(), Nq9 + '.jsonl')
}
```

### R8.2 Retention policy & cleanup targets

**Behavior**

- Cleanup cutoff is computed from `cleanupPeriodDays` (settings) or default `IL7=30`.
- Cleanup runs for:
  - OS cache `errors/` and `mcp-logs-*` (via `KL7`)
  - `~/.claude/projects/**.jsonl` and nested `tool-results` directories (via `VL7`)
  - `~/.claude/plans/*.md` (via `HL7`)
  - `~/.claude/file-history/**` (via `EL7`)
  - `~/.claude/session-env/**` (via `zL7`)
  - plus other caches called from `sU9()` (e.g. `qMB(E$A())` paste-cache cleanup)

**Evidence**

- Anchor: `<CLAUDE_CODE_PKG_ROOT>/cli.js:4975`

```js
function E$A() {
  let B = ((jQ() || {}).cleanupPeriodDays ?? IL7) * 24 * 60 * 60 * 1000
  return new Date(Date.now() - B)
}
```

```js
function HL7() {
  let A = Oj(FQ(), 'plans')
  return FL7(A, '.md')
}
```

```js
var rU9,
  IL7 = 30,
  $L7 = 86400000
```

**Implication (Kode)**

- Cleanup/retention is a first-class behavior. If Kode adopts Claude-compatible directories, it should also align retention knobs (`cleanupPeriodDays`, default 30 days) or provide a clear migration mapping.

## R9) “bash gate dump” forensics — UNKNOWN from static `cli.js`

**What we can prove**

- Claude Code has a dedicated OS-cache `errors/` tree with timestamped `.jsonl` files (R8) and a dedicated `debug/latest` symlink for per-session debug logs (R1.3).
- The Bash tool annotates stderr with sandbox violation blocks (R7) and the UI knows how to strip them.

**What we cannot prove from static evidence**

- A dedicated “bash intent gate” / “LLM gate” dump file family (e.g. `bash-llm-gate/*.txt`) is **not** discoverable from the extracted `cli.js` evidence we relied on in this task. Therefore, any claim about such files/paths would be speculation.

**Verification plan (no guessing)**

1. Run Claude Code in a controlled environment and intentionally trigger:
   - a sandbox violation (to verify `<sandbox_violations>` formatting end-to-end)
   - a Bash tool permission denial (to see what error artifacts are emitted)
2. After reproduction, inspect:
   - `<configRoot>/debug/latest` (R1.3)
   - OS cache `Nl.errors()` (R1.4) for new `*.jsonl`
3. Only after observing actual created files, update this spec with concrete paths + file contents + hashes, and add them into `docs/research/claude-code/01_inventory.json` as additional evidence anchors.
