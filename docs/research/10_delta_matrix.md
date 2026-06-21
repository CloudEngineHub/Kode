# Claude Code vs Kode — 系统性差异矩阵（evidence-based）

> 目标：把 Claude Code 与 Kode 的“可证据化机制差异”压缩成可执行的对齐/升级依据（T12+），并按用户摩擦/风险/收益优先级排序。  
> 约束：本矩阵只收录 **可以被静态证据直接证明** 的差异点；每个差异点都提供 **双向证据**（Claude 原文 + Kode 原文），并给出可落地的后续任务 ID（T12+）。

## 分析对象（固定锚点）

> 路径占位符约定（避免写入机器相关绝对路径）：
>
> - `<CLAUDE_CODE_ROOT>`：Claude Code 外部目录根（包含 `CHANGELOG.md`）
> - `<CLAUDE_CODE_PKG_ROOT>`：Claude Code 安装包根（包含 `cli.js` / `sdk-tools.d.ts` / wasm）
> - `<KODE_REPO_ROOT>`：本仓库根目录

### Claude Code（外部目录，只读）

- package root：`<CLAUDE_CODE_PKG_ROOT>`
- `cli.js`：`<CLAUDE_CODE_PKG_ROOT>/cli.js`
- `sdk-tools.d.ts`：`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts`

### Kode（本 repo）

- repo root：`<KODE_REPO_ROOT>`

## 证据约定（严谨性）

- 引用格式：`path:line` + 代码摘录（摘录为源文件中的 **原样字符串/原样代码**，不插入“截断提示/省略号”）。
- Claude `cli.js` 为混淆/压缩文件：证据摘录采用“同一行内的精确子串”，并以 `cli.js:<line>` 锚定。

## 优先级口径（按摩擦/风险/收益排序）

- **P0**：会导致高摩擦/高风险，或直接破坏 Claude 兼容（目录、日志取证、沙箱提示、会话/子代理落盘等）。
- **P1**：影响稳定性与一致性（工具 schema 兼容、WASM/解析机制、配置/打包差异）。
- **P2**：能力扩展/生态差异（Kode 额外工具、命名兼容层、品牌/前缀策略等）。

---

## P0 — 兼容性与低摩擦底座差异

### D01 (P0 / Reliability) — 默认数据根目录：Claude 默认 `.claude`，Kode 默认 `.kode`（legacy read-compat：`CLAUDE_CONFIG_DIR`）

**影响**

- 用户迁移/排障时的“默认路径心智”不一致；也是后续 sessions/plans/projects/tool-results 等所有路径的根差异。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:9`）

```js
function FQ() {
  return process.env.CLAUDE_CONFIG_DIR ?? u_9(m_9(), '.claude')
}
```

**Kode 证据**（`packages/config/src/dataRoots.ts:65`）

```ts
export function resolveDataRoots(options?: ResolveDataRootsOptions): DataRoots {
  const homeDir = options?.homeDir ?? getDefaultHomeDir()
  const respectEnvOverride =
    options?.respectEnvOverride ?? options?.homeDir === undefined

  const kodeRoot = respectEnvOverride
    ? (getKodeOverride(homeDir) ?? join(homeDir, '.kode'))
    : join(homeDir, '.kode')

  const claudeCompatRoots = respectEnvOverride
    ? dedupeStrings([
        getClaudeOverride(homeDir),
        join(homeDir, LEGACY_CONFIG_DIRNAME),
      ])
    : [join(homeDir, LEGACY_CONFIG_DIRNAME)]

  const allRoots = dedupeStrings([kodeRoot, ...claudeCompatRoots])

  return { kodeRoot, claudeCompatRoots, allRoots }
}
```

**Action**：T12

### D02 (P0 / Reliability) — 会话存储 roots：Claude 单 root；Kode roots 可包含 `.kode` + `.claude`（无 override 时也并列）

**影响**

- Kode 的会话读取/导入可以同时观察两套目录，但也要求“写入永远 Kode-first”的一致策略（避免误写入 Claude 目录）。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:9`）

```js
function FQ() {
  return process.env.CLAUDE_CONFIG_DIR ?? u_9(m_9(), '.claude')
}
```

**Kode 证据**（`packages/protocol/src/utils/kodeAgentSessionLog.ts:82`）

```ts
export function getSessionStoreRoots(): string[] {
  return resolveDataRoots().allRoots
}

function getPrimarySessionStoreRoot(): string {
  return getKodeRoot()
}

export function getSessionProjectsDir(): string {
  return join(getPrimarySessionStoreRoot(), 'projects')
}
```

**Action**：T12、T13

### D03 (P0 / Reliability) — Debug log 文件路径与命名：Claude `debug/<sessionId>.txt`；Kode 默认 `debug/<timestamp>-*.log` 但提供 `debug/<sessionId>.txt` alias + `CLAUDE_CODE_DEBUG_LOGS_DIR` override

**影响**

- “这次 session 的日志在哪里”是排障高频问题；Kode 通过 `debug/<sessionId>.txt` alias 与 `CLAUDE_CODE_DEBUG_LOGS_DIR` override 将该摩擦降到最低。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:11`）

```js
function FCA() {
  return (
    process.env.CLAUDE_CODE_DEBUG_LOGS_DIR ?? bb0(FQ(), 'debug', `${U0()}.txt`)
  )
}
```

**Kode 证据**（`packages/core/src/logging/transports.ts:30`）

```ts
function getDebugLogFileOverride(): string | null {
  const override =
    process.env.KODE_DEBUG_LOG_PATH ??
    process.env[LEGACY_CLAUDE_ENV.codeDebugLogsDir]

  if (!override) return null
  const trimmed = String(override).trim()
  return trimmed ? trimmed : null
}

export const DEBUG_PATHS = {
  base: () => join(getKodeDir(), getProjectDir(process.cwd()), 'debug'),
  detailed: () =>
    getDebugLogFileOverride() ??
    join(DEBUG_PATHS.base(), `${STARTUP_TIMESTAMP}-detailed.log`),
  session: () => join(DEBUG_PATHS.base(), `${SESSION_ID}.txt`),
  flow: () => join(DEBUG_PATHS.base(), `${STARTUP_TIMESTAMP}-flow.log`),
  api: () => join(DEBUG_PATHS.base(), `${STARTUP_TIMESTAMP}-api.log`),
  state: () => join(DEBUG_PATHS.base(), `${STARTUP_TIMESTAMP}-state.log`),
  latest: () => join(DEBUG_PATHS.base(), 'latest'),
}
```

**Action**：T12、T15、T31

### D04 (P0 / UX) — Debug `latest`：Claude 维护 `debug/latest` symlink；Kode 已对齐（并额外提供 `debug/<sessionId>.txt` alias）

**影响**

- 对齐后：用户可直接用 `debug/latest` 定位当前 session 的主 debug log（与 Claude 同语义）。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:11`）

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

**Kode 证据**（`packages/core/src/logging/transports.ts:123`）

```ts
export function ensureDebugDir(): void {
  const debugDir = DEBUG_PATHS.base()
  if (!existsSync(debugDir)) {
    mkdirSync(debugDir, { recursive: true })
  }

  const detailedDir = dirname(DEBUG_PATHS.detailed())
  if (detailedDir !== debugDir && !existsSync(detailedDir)) {
    mkdirSync(detailedDir, { recursive: true })
  }

  createSessionAliasSymlink()
  createLatestSymlink()
}
```

**Action**：T15、T31

### D05 (P0 / Reliability) — errors/messages/mcp logs 位置：Claude 全部走 OS cache；Kode errors/messages 走 baseDir，mcpLogs 走 OS cache

**影响**

- forensics 目录树不同会影响“去哪找证据”；也影响清理策略（retention）。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:12`）

```js
Nl={baseLogs:()=>TdA(PdA.cache,SdA(yA().cwd())),errors:()=>TdA(PdA.cache,SdA(yA().cwd()),"errors"),messages:()=>TdA(PdA.cache,SdA(yA().cwd()),"messages"),mcpLogs:(A)=>TdA(PdA.cache,SdA(yA().cwd()),`mcp-logs-${zh0(A)}`)}});
```

**Kode 证据**（`packages/core/src/logging/log/paths.ts:16`）

```ts
function getLegacyCacheRoot(): string {
  return process.env.KODE_LEGACY_CACHE_ROOT ?? paths.cache
}

function getNewLogRoot(): string {
  return process.env.KODE_LOG_ROOT ?? getKodeBaseDir()
}

export const CACHE_PATHS = {
  errors: () => join(getNewLogRoot(), getProjectDir(process.cwd()), 'errors'),
  messages: () =>
    join(getNewLogRoot(), getProjectDir(process.cwd()), 'messages'),
  mcpLogs: (serverName: string) =>
    join(
      getLegacyCacheRoot(),
      getProjectDir(process.cwd()),
      `mcp-logs-${serverName}`,
    ),
}
```

**Action**：T12、T14、T31

### D06 (P0 / Reliability) — 错误日志扩展名：Claude `*.jsonl`；Kode 已对齐为 `*.jsonl`（仍可读取 legacy `*.txt`）

**影响**

- 影响工具链（tail/jq/索引）的默认假设；也影响导入/兼容工具。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:4986`）

```js
function wq9() {
  return qq9(Nl.errors(), Nq9 + '.jsonl')
}
```

**Kode 证据**（`packages/core/src/logging/log/paths.ts:55`）

```ts
export function getErrorsPath(): string {
  return join(CACHE_PATHS.errors(), DATE + '.jsonl')
}
```

**Action**：T14、T31

### D07 (P0 / Reliability) — retention knob：Claude 支持 `cleanupPeriodDays`；Kode 已对齐支持（默认 30 天，0 表示关闭 cleanup）

**影响**

- 对齐后：通过 `cleanupPeriodDays` 支持按需保留；`0` 可禁用 cleanup，默认 30 天。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:4973`）

```js
function E$A() {
  let B = ((jQ() || {}).cleanupPeriodDays ?? IL7) * 24 * 60 * 60 * 1000
  return new Date(Date.now() - B)
}
```

```js
var rU9,IL7=30,$L7=86400000,
```

**Kode 证据**（`packages/core/src/utils/cleanup.ts:11`）

```ts
const DEFAULT_CLEANUP_PERIOD_DAYS = 30

function readCleanupPeriodDays(): number {
  const settings =
    loadSettingsWithLegacyFallback({
      destination: 'userSettings',
      migrateToPrimary: false,
    }).settings ?? {}

  const raw = (settings as Record<string, unknown>)['cleanupPeriodDays']
  const parsed = toFiniteNonNegativeNumber(raw)
  return parsed ?? DEFAULT_CLEANUP_PERIOD_DAYS
}

function computeCutoffDate(days: number): Date | null {
  if (days === 0) return null
  return new Date(Date.now() - days * ONE_DAY_MS)
}
```

**Action**：T31

### D08 (P0 / Performance) — cleanup scope：Claude 明确清理 `plans/*.md`；Kode cleanup 覆盖 plans/projects/mcp-logs/tool-results 等（已对齐并扩展）

**影响**

- 对齐后：清理覆盖 messages/errors/mcp-logs/plans/projects/tool-results/subagents 等，减少磁盘堆积与排障路径分裂。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:4973`）

```js
function HL7() {
  let A = Oj(FQ(), 'plans')
  return FL7(A, '.md')
}
```

**Kode 证据**（`packages/core/src/utils/cleanup.ts:300`）

```ts
export async function cleanupOldMessageFiles(): Promise<CleanupResult> {
  const days = readCleanupPeriodDays()
  const cutoff = computeCutoffDate(days)
  const deletedCounts: CleanupResult = { messages: 0, errors: 0 }

  if (!cutoff) {
    return deletedCounts
  }

  const targets: Array<{ dirPath: string; countKind: keyof CleanupResult }> = [
    { dirPath: CACHE_PATHS.messages(), countKind: 'messages' },
    { dirPath: CACHE_PATHS.errors(), countKind: 'errors' },
    { dirPath: LEGACY_CACHE_PATHS.messages(), countKind: 'messages' },
    { dirPath: LEGACY_CACHE_PATHS.errors(), countKind: 'errors' },
  ]

  for (const target of targets) {
    addCounts(
      deletedCounts,
      await cleanupFilesInDir({
        dirPath: target.dirPath,
        cutoff,
        suffix: null,
        countKind: target.countKind,
      }),
    )
  }

  addCounts(deletedCounts, await cleanupMcpLogs(cutoff))
  addCounts(deletedCounts, await cleanupPlans(cutoff))
  addCounts(deletedCounts, await cleanupProjects(cutoff))
  addCounts(deletedCounts, await cleanupConversationScopedDirs(cutoff))

  return deletedCounts
}
```

**Action**：T31

### D09 (P0 / Reliability) — background task 输出目录：Claude `<tmp>/claude/<project>/tasks/*.output`；Kode `<baseDir>/<project>/tasks/*.output`

**影响**

- 输出文件位置决定了：并发任务可观测性、是否可被沙箱/权限 allowlist 合理放行、以及排障路径。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:1681`）

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
function r51(A) {
  try {
    let Q = gY(A)
    if (!w9A(Q)) return ''
    return zA2(Q, 'utf8')
  } catch (Q) {
    return (e(Q instanceof Error ? Q : Error(String(Q))), '')
  }
}
function co(A) {
  jZ0()
  let Q = gY(A)
  if (!w9A(Q)) kB(Q, '', 'utf8')
  return Q
}
function BKA(A, Q) {
  try {
    jZ0()
    let B = gY(A)
    if (w9A(B)) $A2(B)
    return (ys8(Q, B), B)
  } catch (B) {
    return (e(B instanceof Error ? B : Error(String(B))), co(A))
  }
}
function UA2() {
  try {
    let A = PSA()
    if (!w9A(A)) return
    let Q = xs8(A)
    for (let B of Q)
      if (B.endsWith('.output'))
        try {
          $A2(_Z0(A, B))
        } catch {}
  } catch {}
}
var EA2
var yC = w(() => {
  A0()
  b1()
  SY()
  EA2 = new Map()
})
```

**Kode 证据**（`packages/runtime/src/taskOutputStore.ts:28`）

```ts
export function getTaskOutputsDir(): string {
  return join(getKodeBaseDir(), getProjectDir(PROJECT_ROOT), 'tasks')
}

export function getTaskOutputFilePath(taskId: string): string {
  return join(getTaskOutputsDir(), `${taskId}.output`)
}
```

**Action**：T15、T12

### D10 (P0 / Security) — tmp base 命名与覆盖：Claude 支持 `CLAUDE_CODE_TMPDIR` 且使用 `claude/` 子目录；Kode 默认 `TMPDIR=/tmp/kode`，并兼容 `CLAUDE_CODE_TMPDIR`（以及 `KODE_TMPDIR`）

**影响**

- tmp roots 与命名是“权限 allowlist / 清理 / 取证”的基础；不一致会导致迁移/复盘困难。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:4728`）

```js
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
```

**Kode 证据**（`packages/runtime/src/shell/sandboxEnv.ts:1`）

```ts
export function resolveSandboxTmpDir(options?: {
  platform?: NodeJS.Platform
}): string

export function buildSandboxEnvAssignments(options?: {
  httpProxyPort?: number
  socksProxyPort?: number
  platform?: NodeJS.Platform
}): string[] {
  const platform = options?.platform ?? process.platform
  const env: string[] = [
    'SANDBOX_RUNTIME=1',
    `TMPDIR=${resolveSandboxTmpDir({ platform })}`,
  ]
```

**Action**：T12、T15

### D11 (P0 / Reliability) — 子代理转录落盘路径：Claude `<sessionId>/subagents/agent-*.jsonl`；Kode 已对齐（写入 `projects/<project>/<sessionId>/subagents/agent-*.jsonl`）

**影响**

- 对齐后：子代理 transcript 统一落在 `projects/<project>/<sessionId>/subagents/`，便于导入、可发现性与任务树聚合。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:4717`）

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
```

**Kode 证据**（`packages/protocol/src/utils/kodeAgentSessionLog.ts:105`）

```ts
export function getAgentLogFilePath(args: {
  cwd: string
  sessionId: string
  agentId: string
}): string {
  return join(
    getSessionProjectDir(args.cwd),
    args.sessionId,
    'subagents',
    `agent-${args.agentId}.jsonl`,
  )
}
```

**Action**：T16、T13

### D12 (P0 / Reliability) — tool-results 目录布局：Claude `projects/<project>/<sessionId>/tool-results`；Kode `<baseDir>/tool-results/<conversationKey>`

**影响**

- 工具结果持久化与 transcript compaction 是“上下文压力/恢复能力”的关键；目录布局差异会影响导入/回放与权限 allowlist。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:1716`）

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
```

**Kode 证据**（`packages/core/src/permissions/fileToolPermissionEngine/plan.ts:106`）

```ts
const toolResultsDir = resolveLikeCliPath(
  path.join(baseDirResolved, 'tool-results', conversationKey),
)
```

**Action**：T16、T12

### D13 (P0 / UX) — transcript placeholder tags：Claude 使用 `<persisted-output>...</persisted-output>`（超大 tool_result offload）与 `<task-notification>...</task-notification>`（background task completion）；Kode 已对齐（保留 legacy `<bash-notification>` 渲染兼容旧转录）

**影响**

- marker 是兼容 surface：导入/回放/展示层需要识别这些“轻量占位符”，否则会丢失可追溯性。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:1724`）

```js
function d9A(A) {
  return 'error' in A
}
function x65(A) {
  let Q = A
  if (Q.code)
    switch (Q.code) {
      case 'ENOENT':
        return `Directory not found: ${Q.path ?? 'unknown path'}`
      case 'EACCES':
        return `Permission denied: ${Q.path ?? 'unknown path'}`
      case 'ENOSPC':
        return 'No space left on device'
      case 'EROFS':
        return 'Read-only file system'
      case 'EMFILE':
        return 'Too many open files'
      case 'EEXIST':
        return `File already exists: ${Q.path ?? 'unknown path'}`
      default:
        return `${Q.code}: ${Q.message}`
    }
  return A.message
}
var DX0 = 'tool-results',
  pG1 = '<persisted-output>',
  KX0 = '</persisted-output>',
  VX0 = '[Old tool result content cleared]',
  j92 = 2000
```

**Claude 证据（task-notification tag names）**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:1383`）

```js
var SC = 'command-name',
  jz = 'command-message',
  YZ0 = 'local-command-caveat',
  VF = 'task-notification',
  cL = 'task-id',
  T51 = 'task-type',
  Ab = 'output-file',
  Tz = 'status',
  Pz = 'summary',
  aDA,
  oDA
```

**Claude 证据（local_bash completion notification formatting）**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:3196`）

```js
function NhA(A,Q,B,G,Z){let Y=B==="completed"?`completed${G!==void 0?` (exit code ${G})`:""}`:B==="failed"?`failed${G!==void 0?` with exit code ${G}`:""}`:"was killed",J=gY(A),X=`<${VF}>
<${cL}>${A}</${cL}>
<${Ab}>${J}</${Ab}>
<${Tz}>${B}</${Tz}>
<${Pz}>Background command "${Q}" ${Y}</${Pz}>
</${VF}>
Read the output file to retrieve the result: ${J}`;CF({value:X,mode:"task-notification"},Z),uY(A,Z,(I)=>({...I,notified:!0}))}function XO0(A,Q){
```

**Kode 证据（tool_result persisted-output）**（`packages/core/src/utils/toolResultPersistence.ts:8`）

```ts
export const PERSISTED_OUTPUT_OPEN_TAG = '<persisted-output>'
export const PERSISTED_OUTPUT_CLOSE_TAG = '</persisted-output>'

const DEFAULT_MAX_RESULT_SIZE_CHARS = 400_000
const PREVIEW_CHARS = 2_000
```

**Kode 证据（tool_result persisted-output formatting）**（`packages/core/src/utils/toolResultPersistence.ts:66`）

```ts
let out = `${PERSISTED_OUTPUT_OPEN_TAG}\n`
out += `Output too large (${originalSize}). Full output saved to: ${meta.filepath}\n\n`
out += `Preview (first ${previewChars}):\n`
out += meta.preview
out += meta.hasMore ? '\n...\n' : '\n'
out += PERSISTED_OUTPUT_CLOSE_TAG
```

**Kode 证据（background bash notification marker）**（`packages/runtime/src/shell/notifications.ts:21`）

```ts
export function renderBashNotification(notification: BashNotification): string {
  const status = notification.status
  const exitCode = notification.exitCode

  const summarySuffix =
    status === 'completed'
      ? `completed${exitCode !== undefined ? ` (exit code ${exitCode})` : ''}`
      : status === 'failed'
        ? `failed${exitCode !== undefined ? ` with exit code ${exitCode}` : ''}`
        : 'was killed'

  const outputFile =
    notification.outputFile || getTaskOutputFilePath(notification.taskId)

  return [
    '<task-notification>',
    `<task-id>${notification.taskId}</task-id>`,
    `<output-file>${outputFile}</output-file>`,
    `<status>${status}</status>`,
    `<summary>Background command "${notification.description}" ${summarySuffix}</summary>`,
    '</task-notification>',
    `Read the output file to retrieve the result: ${outputFile}`,
  ].join('\n')
}
```

**Action**：T16、T15

### D14 (P0 / Security) — sandbox violation 的 stderr side-channel：Claude 用 `<sandbox_violations>` block；Kode 已对齐同格式（无额外 prose）

**影响**

- sandbox 拒绝是高频失败原因；格式不一致会影响 UI 清洗、日志解析、导入复盘。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:417`）

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

**Kode 证据**（`packages/runtime/src/shell/sandboxViolations.ts:1`）

```ts
export function annotateStderrWithSandboxViolations(args: {
  command: string
  stderr: string
  sandbox: BunShellSandboxOptions | undefined
}): string
```

**Action**：T30、T15

### D15 (P0 / Security) — Linux seccomp 资产：Claude 包含 `vendor/seccomp/*` 与 `apply-seccomp`；Kode 已对齐并在发布物中分发（`dist/vendor/seccomp/{x64,arm64}/{apply-seccomp,unix-block.bpf}`）

**影响**

- Claude 的 seccomp 是额外的隔离层；缺失会导致“安全语义不完全等价”，也影响企业审计与预期。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:413`）

```js
function ho1() {
  let A = FFB()
  if (!A)
    return (
      VB(
        `[SeccompFilter] Cannot find pre-generated BPF filter: unsupported architecture ${process.arch}`,
      ),
      null
    )
  VB(`[SeccompFilter] Detected architecture: ${A}`)
  let Q = KFB(VFB(import.meta.url)),
    B = rn('vendor', 'seccomp', A, 'unix-block.bpf'),
    G = [rn(Q, B), rn(Q, '..', '..', B), rn(Q, '..', B)]
  for (let Z of G)
    if (fo1.existsSync(Z))
      return (
        VB(`[SeccompFilter] Found pre-generated BPF filter: ${Z} (${A})`),
        Z
      )
  return (
    VB(
      `[SeccompFilter] Pre-generated BPF filter not found in any expected location (${A})`,
    ),
    null
  )
}
```

```js
function J01() {
  let A = FFB()
  if (!A)
    return (
      VB(
        `[SeccompFilter] Cannot find apply-seccomp binary: unsupported architecture ${process.arch}`,
      ),
      null
    )
  VB(`[SeccompFilter] Looking for apply-seccomp binary for architecture: ${A}`)
  let Q = KFB(VFB(import.meta.url)),
    B = rn('vendor', 'seccomp', A, 'apply-seccomp'),
    G = [rn(Q, B), rn(Q, '..', '..', B), rn(Q, '..', B)]
  for (let Z of G)
    if (fo1.existsSync(Z))
      return (VB(`[SeccompFilter] Found apply-seccomp binary: ${Z} (${A})`), Z)
  return (
    VB(
      `[SeccompFilter] apply-seccomp binary not found in any expected location (${A})`,
    ),
    null
  )
}
```

**Kode 证据**

- `packages/core/src/sandbox/linuxSeccomp.ts`：解析 `vendor/seccomp/<arch>/apply-seccomp` + `unix-block.bpf`（或 test override）
- `packages/core/src/sandbox/bunShellSandboxPlan.ts`：Linux 且 willSandbox 时注入 `linuxSeccomp`；缺失则将 `allowAllUnixSockets` 视为 **effective=true** 并记录 debug warn
- `packages/runtime/src/shell/linuxSandbox.ts`：当 `linuxSeccomp` 存在时，将用户命令包装为 `apply-seccomp <bpf> <shell> -c <command>`
- 发布/打包强制项：
  - `scripts/prepare-seccomp-assets.mjs`：将 CI 构建的 `seccomp-assets/linux-{x64,arm64}` 汇总到 `vendor/seccomp/{x64,arm64}`
  - `scripts/build.mjs`：将 `vendor/seccomp/**` 复制进 `dist/vendor/seccomp/**`
  - `scripts/prepublish-check.js` + `scripts/smoke-packaged-install.sh`：强制校验 `dist/vendor/seccomp/**` 在 npm pack 中存在且可执行

```ts
// bunShellSandboxPlan.ts
const wantsUnixSocketBlocking =
  platform === 'linux' &&
  willSandbox &&
  runtimeConfig.network.allowAllUnixSockets !== true

const linuxSeccomp = wantsUnixSocketBlocking
  ? resolveLinuxSeccompAssets(...)
  : null

const effectiveAllowAllUnixSockets =
  runtimeConfig.network.allowAllUnixSockets === true ||
  (wantsUnixSocketBlocking && !linuxSeccomp)
```

**Action**：T30、T31

### D16 (P0 / Security) — scratchpad allowlist：Claude 显式允许 scratchpad 路径；Kode 已对齐（special allow-read 覆盖 scratchpad）

**影响**

- 对齐后：scratchpad 属于“低摩擦内部产物”；覆盖 allowlist 可避免额外权限弹窗与导入摩擦。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:4728`）

```js
function z$9(A) {
  if (!Z$A()) return !1
  let Q = GC1()
  return A === Q || A.startsWith(Q + fe)
}
```

**Kode 证据**（`packages/core/src/permissions/fileToolPermissionEngine/plan.ts:267`）

```ts
const scratchpadDir = resolveLikeCliPath(
  getScratchpadDirForCurrentSession({ projectKey: projectDir, sessionId }),
)
if (
  isPathWithinAnyAllowedDir({
    inputPath: absolute,
    allowedDirs: [scratchpadDir],
  })
) {
  return 'Scratchpad files for current session are allowed for reading'
}
```

**Action**：T30、T31

### D17 (P0 / UX) — Read 工具的 UI 语义：Claude 根据路径显示 “Reading Plan / Read agent output”；Kode 已对齐（按 plans/tasks 路径动态命名）

**影响**

- 对齐后：Read 的 userFacingName 可区分 plan / agent output / 普通文件，降低微交互认知摩擦。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:1681`）

```js
function RA2(A) {
  if (A?.file_path?.startsWith(GN())) return 'Reading Plan'
  if (A?.file_path && t51(A.file_path)) return 'Read agent output'
  return 'Read'
}
```

**Kode 证据**（`packages/tools/src/tools/filesystem/FileReadTool/FileReadTool.tsx:105`）

```ts
  userFacingName(input?: z.infer<typeof inputSchema>) {
    const filePath = input?.file_path
    if (!filePath) return 'Read'

    const absolute = normalizeFilePath(filePath)
    const absolutePosix = toPosixPath(absolute)

    const planDirPosix = toPosixPath(path.join(getKodeBaseDir(), 'plans'))
    if (isPosixPathWithinDir(absolutePosix, planDirPosix)) {
      return 'Reading Plan'
    }

    if (extractTaskOutputIdFromPath(absolutePosix)) {
      return 'Read agent output'
    }

    return 'Read'
  },
```

**Action**：T28

### D18 (P0 / Reliability) — async tool description：Claude 对 description 显式 await；Kode 已对齐（splitTool 不透传 async，queryLLM 预解析 cachedDescription）

**影响**

- 对齐后：async description 会在 queryLLM 之前 resolve 并写入 cachedDescription，避免 adapter/spec 接收 Promise-returning 函数。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:4954`）

```js
description:await W.prompt({getToolPermissionContext:async()=>X,tools:I,agents:[]}),
```

**Kode 证据**（`packages/core/src/tooling/splitTool.ts:51`）

```ts
export function splitLegacyTool<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = any,
>(tool: Tool<TInput, TOutput>): SplitTool<TInput, TOutput> {
  const spec: ToolSpec<TInput, TOutput> = {
    name: tool.name,
    description:
      tool.cachedDescription ??
      (typeof tool.description === 'string' ? tool.description : undefined),
    inputSchema: tool.inputSchema,
```

**Action**：T19

---

## P1 — 机制/Schema 对齐差异（中等摩擦/中等风险）

### D19 (P1 / Capability) — 打包/embedded assets 检测：Claude 通过 Bun.embeddedFiles；Kode 通过 execPath heuristics 设置 `KODE_PACKAGED`

**影响**

- 影响 WASM/资源加载路径与运行时行为（例如内置/外置资源如何被定位）。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:26`）

```js
function dAA() {
  return process.versions.bun !== void 0
}
function qG() {
  return (
    dAA() && Array.isArray(Bun?.embeddedFiles) && Bun.embeddedFiles.length > 0
  )
}
```

**Kode 证据**（`apps/cli/src/bootstrapEnv.ts:11`）

```ts
export function ensurePackagedRuntimeEnv(): void {
  if (process.env.KODE_PACKAGED !== undefined) return

  try {
    const exec = basename(process.execPath || '').toLowerCase()
    if (
      exec &&
      exec !== 'bun' &&
      exec !== 'bun.exe' &&
      exec !== 'node' &&
      exec !== 'node.exe'
    ) {
      process.env.KODE_PACKAGED = '1'
    }
  } catch {}
```

**Action**：T31

### D20 (P1 / Capability) — WASM 资源定位：Claude `resvg.wasm`；Kode `yoga.wasm`（通过 `YOGA_WASM_PATH`）

**影响**

- 影响 UI 渲染/截图/布局等底层能力，且路径定位策略不同会影响发布形态与可移植性。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:4107`）

```js
function $C7() {
  let A = pE9(zC7(import.meta.url))
  return QS0(pE9(ZvA()), 'resvg.wasm')
}
```

**Kode 证据**（`apps/cli/src/bootstrapEnv.ts:28`）

```ts
export function ensureYogaWasmPath(entrypointUrl: string): void {
  try {
    if (process.env.YOGA_WASM_PATH) return

    const entryFile = fileURLToPath(entrypointUrl)
    const entryDir = dirname(entryFile)
    const devCandidate = join(entryDir, '../../yoga.wasm')
    const distCandidate = join(entryDir, './yoga.wasm')
    const resolved = existsSync(distCandidate)
      ? distCandidate
      : existsSync(devCandidate)
        ? devCandidate
        : undefined
    if (resolved) {
      process.env.YOGA_WASM_PATH = resolved
    }
  } catch {}
```

**Action**：T31

### D21 (P1 / Security) — Bash/命令解析底层：Claude 加载 tree-sitter WASM；Kode 使用正则规则集合（非 tree-sitter）

**影响**

- 解析精度影响安全 gate（例如管道/重定向/复杂语法），也影响提示与审批的可解释性与稳定性。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:2367`）

```js
function findWasmBinary() {
  if (Module.locateFile) return locateFile('tree-sitter.wasm')
  return new URL('tree-sitter.wasm', import.meta.url).href
}
```

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:2388`）

```js
async function zH5(){let A=yA();if(qG()){let J=await YD2("tree-sitter.wasm"),X=await YD2("tree-sitter-bash.wasm");
```

**Kode 证据**（`packages/tools/src/tools/system/BashTool/bashGateRules.ts:44`）

```ts
function applySimpleRules(
  command: string,
  rules: SimpleRule[],
): BashGateFinding[] {
  const findings: BashGateFinding[] = []
  for (const rule of rules) {
    for (const re of rule.patterns) {
      const m = command.match(re)
```

**Action**：T15、T30

### D22 (P1 / Reliability) — Kode 日志根目录可通过 env override；Claude logs 通过 OS cache resolver（env-paths-like）固定派生

**影响**

- 企业/多项目环境里，log root override 对“合规存储/集中采集”很关键；两者策略不同导致运维脚本差异。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:12`）

```js
Nl={baseLogs:()=>TdA(PdA.cache,SdA(yA().cwd())),errors:()=>TdA(PdA.cache,SdA(yA().cwd()),"errors"),messages:()=>TdA(PdA.cache,SdA(yA().cwd()),"messages"),mcpLogs:(A)=>TdA(PdA.cache,SdA(yA().cwd()),`mcp-logs-${zh0(A)}`)}});
```

**Kode 证据**（`packages/core/src/logging/log/paths.ts:16`）

```ts
function getLegacyCacheRoot(): string {
  return process.env.KODE_LEGACY_CACHE_ROOT ?? paths.cache
}

function getNewLogRoot(): string {
  return process.env.KODE_LOG_ROOT ?? getKodeBaseDir()
}
```

**Action**：T12、T31

### D23 (P1 / Capability) — WebSearch `query` 校验：Claude schema 仅 `string`；Kode 已对齐（schema 不额外收紧）

**影响**

- 对齐后：降低 transcript import/replay 的 “schema 过严” 摩擦（空/极短 query 仍可进入工具层处理）。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:304`）

```ts
export interface WebSearchInput {
  /**
   * The search query to use
   */
  query: string;
```

**Kode 证据**（`packages/tools/src/tools/search/WebSearchTool/WebSearchTool.tsx:16`）

```ts
const inputSchema = z.object({
  query: z.string().describe('The search query to use'),
  allowed_domains: z
    .array(z.string())
    .optional()
    .describe('Only include search results from these domains'),
  blocked_domains: z
    .array(z.string())
    .optional()
    .describe('Never include search results from these domains'),
})
```

**Action**：T16、T27

### D24 (P1 / Capability) — WebFetch `url` 校验：Claude schema 为 `string`；Kode 已对齐（schema 不额外收紧）

**影响**

- 对齐后：避免 transcript import/replay 因 schema 过严失败；URL 合法性仍可在 validateInput/运行期给出错误。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:294`）

```ts
export interface WebFetchInput {
  /**
   * The URL to fetch content from
   */
  url: string;
```

**Kode 证据**（`packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx:24`）

```ts
const inputSchema = z.object({
  url: z.string().describe('The URL to fetch content from'),
  prompt: z.string().describe('The prompt to run on the fetched content'),
})
```

**Action**：T16、T27

### D25 (P1 / UX) — Grep `head_limit` 默认语义提示：Claude 默认 0（无限制）；Kode 描述为受 “cap experiment” 影响

**影响**

- 这属于“可预期性摩擦”：同一参数在不同实现里默认结果可能不同（或至少文案不同）。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:225`）

```ts
  /**
   * Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). Defaults to 0 (unlimited).
   */
  head_limit?: number;
```

**Kode 证据**（`packages/tools/src/tools/search/GrepTool/GrepTool.tsx:68`）

```ts
  head_limit: z
    .number()
    .optional()
    .describe(
      'Limit output to first N lines/entries, equivalent to "| head -N". Works across all output modes: content (limits output lines), files_with_matches (limits file paths), count (limits count entries). Defaults based on "cap" experiment value: 0 (unlimited), 20, or 100.',
    ),
```

**Action**：T11、T30

### D26 (P1 / Reliability) — AskUserQuestionInput：Claude schema 允许 `answers`/`metadata`；Kode 已对齐（schema 允许并可忽略）

**影响**

- 对齐后：导入 Claude transcript 时，AskUserQuestion tool call 含 `answers`/`metadata` 不会因 schema 过严而被拒。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:1504`）

```ts
  /**
   * User answers collected by the permission component
   */
  answers?: {
    [k: string]: string;
  };
  /**
   * Optional metadata for tracking and analytics purposes. Not displayed to user.
   */
  metadata?: {
    /**
     * Optional identifier for the source of this question (e.g., "remember" for /remember command). Used for analytics tracking.
     */
    source?: string;
  };
```

**Kode 证据**（`packages/tools/src/tools/interaction/AskUserQuestionTool/AskUserQuestionTool.tsx:22`）

```ts
const inputSchema = z
  .object({
    questions: z.array(questionSchema).min(1).max(4),
    answers: z.record(z.string()).optional(),
    metadata: z
      .object({
        source: z.string().optional(),
      })
      .optional(),
  })
  .refine(
```

**Action**：T16

### D27 (P1 / Reliability) — Task/AgentInput：Claude schema 含 `max_turns`；Kode 已对齐（schema 支持并可忽略）

**影响**

- 对齐后：Claude 产物里出现 `max_turns` 可被 Kode 接受（即便内部不强依赖该字段）。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:32`）

```ts
export interface AgentInput {
  /**
   * A short (3-5 word) description of the task
   */
  description: string
  /**
   * The task for the agent to perform
   */
  prompt: string
  /**
   * The type of specialized agent to use for this task
   */
  subagent_type: string
  /**
   * Optional model to use for this agent. If not specified, inherits from parent. Prefer haiku for quick, straightforward tasks to minimize cost and latency.
   */
  model?: 'sonnet' | 'opus' | 'haiku'
  /**
   * Optional agent ID to resume from. If provided, the agent will continue from the previous execution transcript.
   */
  resume?: string
  /**
   * Set to true to run this agent in the background. The tool result will include an output_file path - use Read tool or Bash tail to check on output.
   */
  run_in_background?: boolean
  /**
   * Maximum number of agentic turns (API round-trips) before stopping. Used internally for warmup.
   */
  max_turns?: number
}
```

**Kode 证据**（`packages/tools/src/tools/ai/TaskTool/schema.ts:4`）

```ts
export const inputSchema = z.object({
  description: z
    .string()
    .describe('A short (3-5 word) description of the task'),
  prompt: z.string().describe('The task for the agent to perform'),
  subagent_type: z
    .string()
    .describe('The type of specialized agent to use for this task'),
  model: z
    .enum(['sonnet', 'opus', 'haiku'])
    .optional()
    .describe(
      'Optional model to use for this agent. If not specified, inherits from parent. Prefer haiku for quick, straightforward tasks to minimize cost and latency.',
    ),
  resume: z
    .string()
    .optional()
    .describe(
      'Optional agent ID to resume from. If provided, the agent will continue from the previous execution transcript.',
    ),
  run_in_background: z
    .boolean()
    .optional()
    .describe(
      'Set to true to run this agent in the background. Use TaskOutput to read the output later.',
    ),
  max_turns: z.number().optional(),
})
```

**Action**：T16

### D28 (P1 / Reliability) — BashInput：Claude schema 含 `_simulatedSedEdit`；Kode 已对齐（schema 支持并可忽略）

**影响**

- 对齐后：Claude transcript 中出现 `_simulatedSedEdit` 可被 Kode 兼容（预览/提示链不因 schema 失败）。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:62`）

```ts
export interface BashInput {
  /**
   * The command to execute
   */
  command: string
  /**
   * Optional timeout in milliseconds (max 600000)
   */
  timeout?: number
  /**
   * Clear, concise description of what this command does in active voice. Never use words like "complex" or "risk" in the description - just describe what it does.
   *
   * For simple commands (git, npm, standard CLI tools), keep it brief (5-10 words):
   * - ls → "List files in current directory"
   * - git status → "Show working tree status"
   * - npm install → "Install package dependencies"
   *
   * For commands that are harder to parse at a glance (piped commands, obscure flags, etc.), add enough context to clarify what it does:
   * - find . -name "*.tmp" -exec rm {} \; → "Find and delete all .tmp files recursively"
   * - git reset --hard origin/main → "Discard all local changes and match remote main"
   * - curl -s url | jq '.data[]' → "Fetch JSON from URL and extract data array elements"
   */
  description?: string
  /**
   * Set to true to run this command in the background. Use TaskOutput to read the output later.
   */
  run_in_background?: boolean
  /**
   * Set this to true to dangerously override sandbox mode and run commands without sandboxing.
   */
  dangerouslyDisableSandbox?: boolean
  /**
   * Internal: pre-computed sed edit result from preview
   */
  _simulatedSedEdit?: {
    filePath: string
    newContent: string
  }
}
```

**Kode 证据**（`packages/tools/src/tools/system/BashTool/BashTool.tsx:19`）

```ts
export const inputSchema = z.object({
  command: z.string().describe('The command to execute'),
  timeout: z
    .number()
    .optional()
    .describe('Optional timeout in milliseconds (max 600000)'),
  description: z
    .string()
    .optional()
    .describe(
      `Clear, concise description of what this command does in 5-10 words, in active voice. Examples:
Input: ls
Output: List files in current directory

Input: git status
Output: Show working tree status

Input: npm install
Output: Install package dependencies

Input: mkdir foo
Output: Create directory 'foo'`,
    ),
  run_in_background: z
    .boolean()
    .optional()
    .describe(
      'Set to true to run this command in the background. Use TaskOutput to read the output later.',
    ),
  dangerouslyDisableSandbox: z
    .boolean()
    .optional()
    .describe(
      'Set this to true to dangerously override sandbox mode and run commands without sandboxing.',
    ),
  _simulatedSedEdit: z
    .object({
      filePath: z.string(),
      newContent: z.string(),
    })
    .optional(),
})
```

**Action**：T16

### D29 (P1 / Reliability) — TaskOutputInput：Claude `block/timeout` 为必填；Kode 可选并提供 default

**影响**

- transcript/tool-call 兼容面：Claude 发来的必填字段 Kode 可接受；但 Kode 的可选默认行为可能与 Claude 调用方预期不同。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:101`）

```ts
export interface TaskOutputInput {
  /**
   * The task ID to get output from
   */
  task_id: string
  /**
   * Whether to wait for completion
   */
  block: boolean
  /**
   * Max wait time in ms
   */
  timeout: number
}
```

**Kode 证据**（`packages/tools/src/tools/system/TaskOutputTool/TaskOutputTool.tsx:12`）

```ts
const inputSchema = z.strictObject({
  task_id: z.string().describe('The task ID to get output from'),
  block: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to wait for completion'),
  timeout: z
    .number()
    .min(0)
    .max(600000)
    .optional()
    .default(30000)
    .describe('Max wait time in ms'),
})
```

**Action**：T16、T15

### D30 (P1 / Security) — ExitPlanModeInput：Claude 定义 `allowedPrompts`；Kode 已对齐（显式定义并 passthrough）

**影响**

- `allowedPrompts` 是权限 UX/计划执行的关键 data；schema 不显式定义会影响可发现性与类型对齐。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:115`）

```ts
export interface ExitPlanModeInput {
  /**
   * Prompt-based permissions needed to implement the plan. These describe categories of actions rather than specific commands.
   */
  allowedPrompts?: {
    /**
     * The tool this prompt applies to
     */
    tool: 'Bash'
    /**
     * Semantic description of the action, e.g. "run tests", "install dependencies"
     */
    prompt: string
  }[]
  [k: string]: unknown
}
```

**Kode 证据**（`packages/tools/src/tools/interaction/PlanModeTool/ExitPlanModeTool.tsx:30`）

```ts
const inputSchema = z
  .object({
    allowedPrompts: z
      .array(
        z.object({
          tool: z.literal('Bash'),
          prompt: z.string(),
        }),
      )
      .optional(),
  })
  .passthrough()
```

**Action**：T11、T30

---

## P2 — 能力/生态差异（Kode 扩展 + 命名/兼容层）

> 注：以下差异点以 `sdk-tools.d.ts` 的工具输入类型联合（Claude 可见工具面）为“Claude 工具边界”证据；Kode 侧以 `packages/tools/src/registry.ts` 为事实工具清单。

### D31 (P2 / Capability) — 额外工具：Kode `AskExpertModelTool`（Claude tool schema 不包含）

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:11`）

```ts
export type ToolInputSchemas =
  | AgentInput
  | BashInput
  | TaskOutputInput
  | ExitPlanModeInput
  | FileEditInput
  | FileReadInput
  | FileWriteInput
  | GlobInput
  | GrepInput
  | KillShellInput
  | ListMcpResourcesInput
  | McpInput
  | NotebookEditInput
  | ReadMcpResourceInput
  | TodoWriteInput
  | WebFetchInput
  | WebSearchInput
  | AskUserQuestionInput
  | ConfigInput
```

**Kode 证据**（`packages/tools/src/registry.ts:35`）

```ts
  AskExpertModelTool as unknown as Tool,
```

**Action**：T20、T11

### D32 (P2 / UX) — 额外工具：Kode `EnterPlanModeTool`（Claude tool schema 不包含）

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:11`）

```ts
export type ToolInputSchemas =
  | AgentInput
  | BashInput
  | TaskOutputInput
  | ExitPlanModeInput
  | FileEditInput
  | FileReadInput
  | FileWriteInput
  | GlobInput
  | GrepInput
  | KillShellInput
  | ListMcpResourcesInput
  | McpInput
  | NotebookEditInput
  | ReadMcpResourceInput
  | TodoWriteInput
  | WebFetchInput
  | WebSearchInput
  | AskUserQuestionInput
  | ConfigInput
```

**Kode 证据**（`packages/tools/src/registry.ts:51`）

```ts
  EnterPlanModeTool as unknown as Tool,
```

**Action**：T11、T28

### D33 (P2 / Capability) — 额外工具：Kode `LSTool`（Claude tool schema 不包含）

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:11`）

```ts
export type ToolInputSchemas =
  | AgentInput
  | BashInput
  | TaskOutputInput
  | ExitPlanModeInput
  | FileEditInput
  | FileReadInput
  | FileWriteInput
  | GlobInput
  | GrepInput
  | KillShellInput
  | ListMcpResourcesInput
  | McpInput
  | NotebookEditInput
  | ReadMcpResourceInput
  | TodoWriteInput
  | WebFetchInput
  | WebSearchInput
  | AskUserQuestionInput
  | ConfigInput
```

**Kode 证据**（`packages/tools/src/registry.ts:39`）

```ts
  LSTool as unknown as Tool,
```

**Action**：T20

### D34 (P2 / Capability) — 额外工具：Kode `LspTool`（Claude tool schema 不包含）

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:11`）

```ts
export type ToolInputSchemas =
  | AgentInput
  | BashInput
  | TaskOutputInput
  | ExitPlanModeInput
  | FileEditInput
  | FileReadInput
  | FileWriteInput
  | GlobInput
  | GrepInput
  | KillShellInput
  | ListMcpResourcesInput
  | McpInput
  | NotebookEditInput
  | ReadMcpResourceInput
  | TodoWriteInput
  | WebFetchInput
  | WebSearchInput
  | AskUserQuestionInput
  | ConfigInput
```

**Kode 证据**（`packages/tools/src/registry.ts:42`）

```ts
  LspTool as unknown as Tool,
```

**Action**：T20、T28

### D35 (P2 / UX) — 额外工具：Kode `SlashCommandTool`（Claude tool schema 不包含）

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:11`）

```ts
export type ToolInputSchemas =
  | AgentInput
  | BashInput
  | TaskOutputInput
  | ExitPlanModeInput
  | FileEditInput
  | FileReadInput
  | FileWriteInput
  | GlobInput
  | GrepInput
  | KillShellInput
  | ListMcpResourcesInput
  | McpInput
  | NotebookEditInput
  | ReadMcpResourceInput
  | TodoWriteInput
  | WebFetchInput
  | WebSearchInput
  | AskUserQuestionInput
  | ConfigInput
```

**Kode 证据**（`packages/tools/src/registry.ts:53`）

```ts
  SlashCommandTool as unknown as Tool,
```

**Action**：T20、T24、T25

### D36 (P2 / Capability) — 额外工具：Kode `SkillTool`（Claude tool schema 不包含）

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:11`）

```ts
export type ToolInputSchemas =
  | AgentInput
  | BashInput
  | TaskOutputInput
  | ExitPlanModeInput
  | FileEditInput
  | FileReadInput
  | FileWriteInput
  | GlobInput
  | GrepInput
  | KillShellInput
  | ListMcpResourcesInput
  | McpInput
  | NotebookEditInput
  | ReadMcpResourceInput
  | TodoWriteInput
  | WebFetchInput
  | WebSearchInput
  | AskUserQuestionInput
  | ConfigInput
```

**Kode 证据**（`packages/tools/src/registry.ts:54`）

```ts
  SkillTool as unknown as Tool,
```

**Action**：T24、T25

### D37 (P2 / Capability) — 额外工具：Kode `MCPSearchTool`（Claude tool schema 不包含）

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/sdk-tools.d.ts:11`）

```ts
export type ToolInputSchemas =
  | AgentInput
  | BashInput
  | TaskOutputInput
  | ExitPlanModeInput
  | FileEditInput
  | FileReadInput
  | FileWriteInput
  | GlobInput
  | GrepInput
  | KillShellInput
  | ListMcpResourcesInput
  | McpInput
  | NotebookEditInput
  | ReadMcpResourceInput
  | TodoWriteInput
  | WebFetchInput
  | WebSearchInput
  | AskUserQuestionInput
  | ConfigInput
```

**Kode 证据**（`packages/tools/src/registry.ts:57`）

```ts
  MCPSearchTool as unknown as Tool,
```

**Action**：T26

### D38 (P2 / Reliability) — debug logs base：Claude debug logs 从 `FQ()`（config root）派生；Kode 已对齐（debug base 追随 `getKodeBaseDir()`）

**影响**

- 对齐后：debug logs base 追随 `KODE_CONFIG_DIR` / `CLAUDE_CONFIG_DIR` 等 resolver，避免“数据根分裂”。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:11`）

```js
function FCA() {
  return (
    process.env.CLAUDE_CODE_DEBUG_LOGS_DIR ?? bb0(FQ(), 'debug', `${U0()}.txt`)
  )
}
```

**Kode 证据**（`packages/core/src/logging/transports.ts:20`）

```ts
export function getKodeDir(): string {
  return getKodeBaseDir()
}

export const KODE_DIR = getKodeDir()
```

**Action**：T12、T31

### D39 (P2 / Security) — special allow-read：Kode 允许读取 `bash-outputs/<conversationKey>`；Claude 以 `tasks/*.output` 为 bash/任务输出形态

**影响**

- 两种内部产物路径不同，迁移与权限“免打扰策略”需要统一/映射。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:1681`）

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
```

**Kode 证据**（`packages/core/src/permissions/fileToolPermissionEngine/plan.ts:278`）

```ts
const tasksDir = resolveLikeCliPath(
  path.join(baseDirResolved, projectDir, 'tasks'),
)
if (
  isPathWithinAnyAllowedDir({ inputPath: absolute, allowedDirs: [tasksDir] })
) {
  return 'Project temp directory files are allowed for reading'
}

const claudeTasksDir = resolveLikeCliPath(
  path.join(getClaudeCodeTmpBaseDir(), 'claude', projectDir, 'tasks'),
)
if (
  isPathWithinAnyAllowedDir({
    inputPath: absolute,
    allowedDirs: [claudeTasksDir],
  })
) {
  return 'Project temp directory files are allowed for reading'
}
```

**Action**：T15、T12

### D40 (P2 / UX) — “SandboxedBash” 指示开关 env：Claude 使用 `CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR`；Kode 采用 `KODE_*` 前缀并兼容 Claude env

**影响**

- 属于 Kode-first + legacy compat 的典型面：env 前缀策略必须全局一致，避免碎片化。

**Claude 证据**（`<CLAUDE_CODE_PKG_ROOT>/cli.js:3217`）

```js
return WFA(A)&&n1(process.env.CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR)?"SandboxedBash":"Bash"}
```

**Kode 证据**（`packages/tools/src/tools/system/BashTool/BashTool.tsx:90`）

```ts
  userFacingName(input?: z.infer<typeof inputSchema>) {
    if (!input) return 'Bash'

    const raw =
      process.env.KODE_BASH_SANDBOX_SHOW_INDICATOR ??
      process.env.CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR
    // Compatibility: only explicit truthy values enable the indicator.
    const showIndicator = raw
      ? ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
      : false
    if (!showIndicator) return 'Bash'

    const plan = getBunShellSandboxPlan({
      command: input.command,
      dangerouslyDisableSandbox: input.dangerouslyDisableSandbox === true,
    })
    return plan.willSandbox ? 'SandboxedBash' : 'Bash'
  },
```

**Action**：T31、T11
