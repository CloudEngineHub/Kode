# Kode baseline (事实盘点) — 架构/入口/机制/存储/UI（evidence-based）

> 目标：给后续差异矩阵（T10）与升级任务（T12+）提供“事实层基线”。本文件所有结论都以本 repo 源码为准，并给出可核验的原文证据（文件路径 + 行号 + 摘录）。

Repo root（分析对象）：`<KODE_REPO_ROOT>`

## B0) 证据约定

- 引用格式：`path:line` + 代码摘录（与仓库当前内容一致）。
- “Kode-first + legacy 兼容”仅在代码中出现明确 fallback/compat 分支时才写入结论。

---

## B1) CLI 入口与运行形态（interactive vs print）

### B1.1 轻量 dispatch：版本/帮助 fast-path + 选择 entrypoint

- 结论：`apps/cli/src/dispatch.ts` 先做极轻量的 flag 预解析（`--version` / `--help-lite`），再按 `--acp` 选择 daemon/cli 入口。
- 证据：`apps/cli/src/dispatch.ts:11`

```ts
// Minimal pre-parse: handle version/help early without loading heavy UI modules
if (hasFlag('--version', '-v')) {
  process.stdout.write(`${MACRO.VERSION || ''}\n`)
  process.exit(0)
}

if (hasFlag('--help-lite')) {
  process.stdout.write(
    `Usage: kode [options] [command] [prompt]\n\n` +
      `Common options:\n` +
      `  -h, --help           Show full help\n` +
      `  -v, --version        Show version\n` +
      `  -p, --print          Print response and exit (non-interactive)\n` +
      `  --cwd <cwd>          Set working directory\n` +
      `  -r, --resume [id]    Resume a conversation (optional ID/name)\n` +
      `  -c, --continue       Continue the most recent conversation\n`,
  )
  process.exit(0)
}

// For compatibility, --help loads full CLI help.
// NOTE: ACP mode is hosted by the server app (merged per blueprint).
if (hasFlag('--acp')) {
  await import('./entrypoints/daemon.ts')
} else {
  await import('./entrypoints/cli.ts')
}
```

### B1.2 CLI 主入口：`runCli()` 初始化（配置/终端能力/stdin/TTY）

- 结论：`runCli()` 在启动时：初始化 debug logger；启用配置系统并对 GPT-5 profiles 做 best-effort repair；按条件进入 alternate screen；在 stdin 非 TTY 时尝试打开 `/dev/tty` 作为交互输入；最后把控制权交给命令行解析器 `parseArgs()`。
- 证据：`apps/cli/src/app.tsx:45`

```ts
export async function runCli(): Promise<void> {
  ensurePackagedRuntimeEnv()
  ensureYogaWasmPath(import.meta.url)

  // 初始化调试日志系统
  initDebugLogger()

  // Validate configs are valid and enable configuration system
  try {
    enableConfigs()

    // 🔧 Validate and auto-repair GPT-5 model profiles (best-effort, non-blocking)
    // Avoid printing during interactive render; log to file on failure.
    queueMicrotask(() => {
      try {
        validateAndRepairAllGPT5Profiles()
      } catch (repairError) {
        logError(`GPT-5 configuration validation failed: ${repairError}`)
      }
    })
  } catch (error: unknown) {
    if (error instanceof ConfigParseError) {
      await showInvalidConfigDialog({ error })
      return
    }
  }

  const config = getGlobalConfig()
  const screenReaderEnv =
    process.env.KODE_SCREEN_READER ?? process.env.SCREENREADER
  const isScreenReader = Boolean(screenReaderEnv)

  if (
    shouldEnterAlternateScreen(
      config.useAlternateBuffer ?? false,
      isScreenReader,
    ) &&
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !wantsPrintMode()
  ) {
    enterAlternateScreen()
    didEnterAlternateScreen = true
  }

  // Disabled background notifier to avoid mid-screen logs during REPL

  let inputPrompt = ''
  let renderContext: RenderOptions | undefined = {
    exitOnCtrlC: false,
  }

  const wantsStreamJsonStdin =
    process.argv.some(
      (arg, idx, all) =>
        arg === '--input-format' && all[idx + 1] === 'stream-json',
    ) || process.argv.some(arg => arg.startsWith('--input-format=stream-json'))

  if (
    !process.stdin.isTTY &&
    !process.env.CI &&
    // Input hijacking breaks MCP.
    !process.argv.includes('mcp') &&
    !wantsStreamJsonStdin
  ) {
    inputPrompt = await stdin()
    if (process.platform !== 'win32') {
      try {
        const ttyFd = openSync('/dev/tty', 'r')
        renderContext = { ...renderContext, stdin: new ReadStream(ttyFd) }
      } catch (err) {
        logError(`Could not open /dev/tty: ${err}`)
      }
    }
  }
  if (process.stdin.isTTY && process.stdout.isTTY) {
    await terminalCapabilityManager.detectCapabilities()
    terminalCapabilityManager.enableSupportedModes()
  }
  await parseArgs(inputPrompt, renderContext)
}
```

---

## B2) 配置系统与数据根目录（Kode-first + `.claude` fallback）

### B2.1 用户级 base dir：`KODE_CONFIG_DIR`（Kode-first），`CLAUDE_CONFIG_DIR` 仅 legacy 兼容

- 结论：核心数据根目录由 `resolveDataRoots().kodeRoot` 决定，**只**尊重 `KODE_CONFIG_DIR`（以及 `ANYKODE_CONFIG_DIR`），否则默认 `~/.kode`。
- `CLAUDE_CONFIG_DIR` 仅影响 legacy 读取兼容根目录（`resolveDataRoots().claudeCompatRoots`），不会改变 Kode primary 根目录。
- 证据：`packages/config/src/dataRoots.ts:54`

```ts
function getKodeOverride(homeDir: string): string | null {
  return normalizeOverride(
    process.env.KODE_CONFIG_DIR ?? process.env.ANYKODE_CONFIG_DIR,
    homeDir,
  )
}

function getClaudeOverride(homeDir: string): string | null {
  return normalizeOverride(process.env[LEGACY_ENV.configDir], homeDir)
}

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

### B2.2 Settings 文件候选：primary `.kode` + legacy `.claude`（用户/项目/本地）

- 结论：`packages/config/src/files.ts` 将 settings 按 destination 分三类（`localSettings/projectSettings/userSettings`），每类都给出 primary（`.kode/...`）与 legacy（`.claude/...`）候选路径；userSettings 的 primary/legacy roots 由 `resolveDataRoots()` 提供（Kode-first + legacy read-compat）。
- 证据：`packages/config/src/files.ts:35`

```ts
export function getSettingsFileCandidates(options: {
  destination: SettingsDestination
  projectDir?: string
  homeDir?: string
}): { primary: string; legacy: string[] } | null {
  const projectDir = options.projectDir ?? getCwd()
  const respectEnvOverride = options.homeDir === undefined

  switch (options.destination) {
    case 'localSettings': {
      const primary = join(projectDir, '.kode', 'settings.local.json')
      const legacy = [
        legacyConfigPathInProject(projectDir, 'settings.local.json'),
      ]
      return { primary, legacy }
    }
    case 'projectSettings': {
      const primary = join(projectDir, '.kode', 'settings.json')
      const legacy = [legacyConfigPathInProject(projectDir, 'settings.json')]
      return { primary, legacy }
    }
    case 'userSettings': {
      const roots = resolveDataRoots({
        homeDir: options.homeDir,
        respectEnvOverride,
      })
      const primary = join(roots.kodeRoot, 'settings.json')
      const legacy = roots.claudeCompatRoots.map(root =>
        join(root, 'settings.json'),
      )
      return { primary, legacy }
    }
    default:
      return null
  }
}
```

---

## B3) 工具系统（Tool contract + registry）

### B3.1 Tool 接口：UI 框架无关 + ToolUseContext（permission/sandbox/session hooks）

- 结论：`packages/core/src/tooling/Tool.ts` 定义了统一 Tool 合约；`ToolUseContext.options` 里包含 `permissionMode/toolPermissionContext/commandAllowedTools/persistSession/shouldAvoidPermissionPrompts` 等执行上下文关键字段。
- 证据：`packages/core/src/tooling/Tool.ts:33`

```ts
export interface ToolUseContext {
  messageId: string | undefined
  toolUseId?: string
  agentId?: string
  safeMode?: boolean
  /**
   * Used to distinguish user-initiated shell commands from agent-initiated ones.
   * Impacts sandboxing + safety gates for tools like Bash.
   */
  commandSource?: CommandSource
  abortController: AbortController
  readFileTimestamps: { [filePath: string]: number }
  options?: {
    commands?: any[]
    tools?: any[]
    verbose?: boolean
    slowAndCapableModel?: string
    safeMode?: boolean
    permissionMode?: PermissionMode
    toolPermissionContext?: ToolPermissionContext
    /**
     * Plain-text content of the most recent user message before any internal
     * reminder injections. Used for intent-alignment checks (e.g. Bash gate).
     */
    lastUserPrompt?: string
    /**
     * Optional host hook to supply additional system prompt blocks.
     *
     * Used for compatibility/prompt-profile layers (e.g., reference-style
     * builders) without requiring every tool host to plumb custom prompt
     * additions through separate config objects.
     */
    getCustomSystemPromptAdditions?: () => string[]
    forkNumber?: number
    messageLogName?: string
    maxThinkingTokens?: any
    model?: string
    commandAllowedTools?: string[]
    isKodingRequest?: boolean
    kodingContext?: string
    isCustomCommand?: boolean
    mcpClients?: any[]
    /**
     * Test-only override for the Bash LLM intent gate query function.
     * Allows unit tests to force deterministic gate results without calling real models.
     */
    bashLlmGateQuery?: (args: {
      systemPrompt: string[]
      userInput: string
      signal: AbortSignal
      model?: 'quick' | 'main'
    }) => Promise<string>
    disableSlashCommands?: boolean
    /**
     * When false, suppress legacy-compatible session persistence (.jsonl under config/projects).
     * Default: true for CLI sessions; some internal tools may opt out to avoid polluting session logs.
     */
    persistSession?: boolean
    /**
     * When true, the current execution context cannot show interactive permission prompts.
     * Any permission decision that would normally prompt should be auto-denied.
     */
    shouldAvoidPermissionPrompts?: boolean
    /**
     * Host-provided interactive permission prompt for tool-like permission flows that
     * happen inside a tool call (e.g. Bash sandbox network proxy bootstrap on macOS).
     *
     * When not provided, tools must fail closed (deny) without prompting.
     */
    requestToolUsePermission?: (
      request: {
        tool: any
        description: string
        input: { [key: string]: unknown }
        commandPrefix: any | null
        suggestions?: any[]
        riskScore: number | null
      },
      toolUseContext: ToolUseContext,
    ) => Promise<
      | { result: true; type: 'permanent' | 'temporary' }
      | { result: false; rejectionMessage?: string }
    >
```

### B3.2 Tool registry：固定内置工具 + 动态 MCP 工具（按 isEnabled 过滤）

- 结论：`packages/tools/src/registry.ts` 用 `getAllTools()` 定义基础工具列表，并通过 `getMCPTools()` 追加 MCP 动态工具；最终按 `tool.isEnabled()` 过滤。
- 证据：`packages/tools/src/registry.ts:33`

```ts
export const getAllTools = (): Tool[] => [
  TaskTool as unknown as Tool,
  AskExpertModelTool as unknown as Tool,
  BashTool as unknown as Tool,
  TaskOutputTool as unknown as Tool,
  KillShellTool as unknown as Tool,
  LSTool as unknown as Tool,
  GlobTool as unknown as Tool,
  GrepTool as unknown as Tool,
  LspTool as unknown as Tool,
  FileReadTool as unknown as Tool,
  FileEditTool as unknown as Tool,
  FileWriteTool as unknown as Tool,
  NotebookEditTool as unknown as Tool,
  TodoWriteTool as unknown as Tool,
  WebSearchTool as unknown as Tool,
  WebFetchTool as unknown as Tool,
  AskUserQuestionTool as unknown as Tool,
  EnterPlanModeTool as unknown as Tool,
  ExitPlanModeTool as unknown as Tool,
  SlashCommandTool as unknown as Tool,
  SkillTool as unknown as Tool,
  ListMcpResourcesTool as unknown as Tool,
  ReadMcpResourceTool as unknown as Tool,
  MCPSearchTool as unknown as Tool,
  MCPTool as unknown as Tool,
]

export const getTools = memoize(
  async (_includeOptional?: boolean): Promise<Tool[]> => {
    const tools = [...getAllTools(), ...(await getMCPTools())]

    const isEnabled = await Promise.all(tools.map(tool => tool.isEnabled()))
    return tools.filter((_, i) => isEnabled[i])
  },
)
```

---

## B4) 权限系统（mode + rule engine + persisted settings + per-command allowlist）

### B4.1 统一 permission gate：dontAsk / prompts-unavailable 自动拒绝

- 结论：`packages/core/src/permissions/engine.ts` 在 `dontAsk` 或 `shouldAvoidPermissionPrompts` 场景会 fail-closed，返回明确的 auto-deny 文案。
- 证据：`packages/core/src/permissions/engine.ts:83`

```ts
const dontAskDenied: PermissionResult = {
  result: false,
  message: `Permission to use ${tool.name} has been auto-denied in dontAsk mode.`,
  shouldPromptUser: false,
}
const promptsUnavailableDenied: PermissionResult = {
  result: false,
  message: `Permission to use ${tool.name} has been auto-denied (prompts unavailable).`,
  shouldPromptUser: false,
}
```

### B4.2 per-command `allowedTools` 注入会进入同一规则引擎（command source）

- 结论：permission engine 会把 `context.options.commandAllowedTools` 合并进 `toolPermissionContext.alwaysAllowRules.command`，使“slash command/skill 声明的 allowedTools”与持久化规则一起生效。
- 证据：`packages/core/src/permissions/engine.ts:211`

```ts
// Per-command allowedTools (e.g. `Read(~/**)`) must participate in the same
// rule engine as persisted permission rules.
if (commandAllowedTools.length > 0) {
  const existing = effectiveToolPermissionContext.alwaysAllowRules.command ?? []
  effectiveToolPermissionContext.alwaysAllowRules.command = [
    ...new Set([...existing, ...commandAllowedTools]),
  ]
}
```

### B4.3 权限持久化：从 settings（primary + legacy fallback）加载，并可写回 primary（可选同步 legacy）

- 结论：`loadToolPermissionContextFromDisk()` 会读取 `user/project/local` 三类 settings（并 `migrateToPrimary: true`）；写回时使用 `saveSettingsToPrimaryAndSyncLegacy(... syncLegacyIfExists: true)`。
- 证据：`packages/core/src/permissions/toolPermissionSettings.ts:75`

```ts
const destinations: SettingsDestination[] = [
  'userSettings',
  'projectSettings',
  'localSettings',
]

for (const destination of destinations) {
  const settings = loadSettingsWithLegacyFallback({
    destination,
    projectDir,
    homeDir,
    migrateToPrimary: true,
  }).settings as SettingsFileWithPermissions | null
  const perms = settings?.permissions
  const allow = uniqueStrings(perms?.allow)
  const deny = uniqueStrings(perms?.deny)
  const ask = uniqueStrings(perms?.ask)
  const additionalDirectories = uniqueStrings(perms?.additionalDirectories)

  if (allow.length > 0) base.alwaysAllowRules[destination] = allow
  if (deny.length > 0) base.alwaysDenyRules[destination] = deny
  if (ask.length > 0) base.alwaysAskRules[destination] = ask

  for (const dir of additionalDirectories) {
    base.additionalWorkingDirectories.set(dir, {
      path: dir,
      source: destination,
    })
  }
}
```

- 证据：`packages/core/src/permissions/toolPermissionSettings.ts:224`

```ts
saveSettingsToPrimaryAndSyncLegacy({
  destination: update.destination,
  projectDir: options.projectDir,
  homeDir: options.homeDir,
  settings: existing as SettingsFile,
  syncLegacyIfExists: true,
})
return { persisted: true }
```

---

## B5) Agent 系统（加载优先级、目录发现、缓存、watcher）

### B5.1 Agent 合并优先级：built-in → plugin → user → project → flag → policy（后者覆盖前者）

- 结论：`mergeAgents()` 按 source 分组后顺序写入 Map，后写入覆盖前写入，因此最终优先级由数组顺序决定。
- 证据：`packages/core/src/agent/loader.ts:36`

```ts
function mergeAgents(allAgents: AgentConfig[]): AgentConfig[] {
  const builtIn = allAgents.filter(a => a.source === 'built-in')
  const plugin = allAgents.filter(a => a.source === 'plugin')
  const user = allAgents.filter(a => a.source === 'userSettings')
  const project = allAgents.filter(a => a.source === 'projectSettings')
  const flag = allAgents.filter(a => a.source === 'flagSettings')
  const policy = allAgents.filter(a => a.source === 'policySettings')

  const ordered = [builtIn, plugin, user, project, flag, policy]
  const map = new Map<string, AgentConfig>()
  for (const group of ordered) {
    for (const agent of group) {
      map.set(agent.agentType, agent)
    }
  }
  return Array.from(map.values())
}
```

### B5.2 Agent 目录：`.kode/agents` 与 `.claude/agents` 同时扫描（含 policy 系统目录）

- 结论：Agent loader 同时扫描：
  - 系统 policy：`getLegacyPolicyBaseDir()/.kode/agents` 与 `.../.claude/agents`
  - 用户：`getUserConfigRoots()` 返回的 roots 下的 `agents/`
  - 项目：`findProjectAgentDirs(getCwd())`（向上遍历祖先目录）
  - 插件：session plugins 提供的 `agentsDirs`
- 证据：`packages/core/src/agent/loader.ts:116`

```ts
// Plugins
const sessionPlugins = getSessionPlugins()
const pluginAgentDirs = sessionPlugins.flatMap(p => p.agentsDirs ?? [])
const pluginAgents = pluginAgentDirs.flatMap(dir =>
  scanAgentPaths({
    dirPathOrFile: dir,
    baseDir: dir,
    source: 'plugin',
    seenInodes,
  }),
)

// Policy
const legacyPolicyBaseDir = getLegacyPolicyBaseDir()
const policyAgents = [
  ...scanAgentPaths({
    dirPathOrFile: join(legacyPolicyBaseDir, '.kode', 'agents'),
    baseDir: join(legacyPolicyBaseDir, '.kode', 'agents'),
    source: 'policySettings',
    seenInodes,
  }),
  ...scanAgentPaths({
    dirPathOrFile: join(legacyPolicyBaseDir, '.claude', 'agents'),
    baseDir: join(legacyPolicyBaseDir, '.claude', 'agents'),
    source: 'policySettings',
    seenInodes,
  }),
]

// User
const userAgents: AgentConfig[] = []
if (isSettingSourceEnabled('userSettings')) {
  for (const root of getUserConfigRoots()) {
    const dir = join(root, 'agents')
    userAgents.push(
      ...scanAgentPaths({
        dirPathOrFile: dir,
        baseDir: dir,
        source: 'userSettings',
        seenInodes,
      }),
    )
  }
}

// Project
const projectAgents: AgentConfig[] = []
if (isSettingSourceEnabled('projectSettings')) {
  const dirs = findProjectAgentDirs(getCwd())
  for (const dir of dirs) {
    projectAgents.push(
      ...scanAgentPaths({
        dirPathOrFile: dir,
        baseDir: dir,
        source: 'projectSettings',
        seenInodes,
      }),
    )
  }
}
```

- 证据：`packages/core/src/agent/storage.ts:37`

```ts
export function getUserConfigRoots(): string[] {
  const claudeOverride = normalizeOverride(process.env.CLAUDE_CONFIG_DIR)
  const kodeOverride = normalizeOverride(process.env.KODE_CONFIG_DIR)

  const hasAnyOverride = Boolean(claudeOverride || kodeOverride)
  if (hasAnyOverride) {
    return dedupeStrings([kodeOverride ?? '', claudeOverride ?? ''])
  }

  return dedupeStrings([join(homedir(), '.kode'), join(homedir(), '.claude')])
}

export function findProjectAgentDirs(cwd: string): string[] {
  const result: string[] = []
  const home = resolve(homedir())
  let current = resolve(cwd)

  while (current !== home) {
    const kodeDir = join(current, '.kode', 'agents')
    if (existsSync(kodeDir)) result.push(kodeDir)

    const claudeDir = join(current, '.claude', 'agents')
    if (existsSync(claudeDir)) result.push(claudeDir)

    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return result
}
```

### B5.3 缓存与 watcher：memoize + fs.watch 监听 `.md` 变更（best-effort）

- 结论：Agent 查询 API（`getActiveAgents/getAllAgents/getAgentByType/getAvailableAgentTypes`）使用 `lodash-es` 的 `memoize` 缓存；`startAgentWatcher()` 用 `fs.watch` 监听目录下 `.md` 文件变更并清 cache。
- 证据：`packages/core/src/agent/loader.ts:190`

```ts
export const getActiveAgents = memoize(async (): Promise<AgentConfig[]> => {
  const { activeAgents } = await loadAllAgents()
  return activeAgents
})

export const getAllAgents = memoize(async (): Promise<AgentConfig[]> => {
  const { allAgents } = await loadAllAgents()
  return allAgents
})

export const getAgentByType = memoize(
  async (agentType: string): Promise<AgentConfig | undefined> => {
    const agents = await getActiveAgents()
    return agents.find(agent => agent.agentType === agentType)
  },
)

export const getAvailableAgentTypes = memoize(async (): Promise<string[]> => {
  const agents = await getActiveAgents()
  return agents.map(agent => agent.agentType)
})

export function clearAgentCache(): void {
  getActiveAgents.cache?.clear?.()
  getAllAgents.cache?.clear?.()
  getAgentByType.cache?.clear?.()
  getAvailableAgentTypes.cache?.clear?.()
}

let watchers: FSWatcher[] = []

export async function startAgentWatcher(onChange?: () => void): Promise<void> {
  await stopAgentWatcher()

  const watchDirs: string[] = []

  // Policy
  {
    const legacyPolicyBaseDir = getLegacyPolicyBaseDir()
    watchDirs.push(join(legacyPolicyBaseDir, '.kode', 'agents'))
    watchDirs.push(join(legacyPolicyBaseDir, '.claude', 'agents'))
  }

  // User
  if (isSettingSourceEnabled('userSettings')) {
    for (const root of getUserConfigRoots()) {
      watchDirs.push(join(root, 'agents'))
    }
  }

  // Project
  if (isSettingSourceEnabled('projectSettings')) {
    watchDirs.push(...findProjectAgentDirs(getCwd()))
  }

  // Plugins (session-scoped)
  for (const plugin of getSessionPlugins()) {
    for (const dir of plugin.agentsDirs ?? []) {
      watchDirs.push(dir)
    }
  }

  for (const dirPath of dedupeStrings(watchDirs)) {
    if (!existsSync(dirPath)) continue
    try {
      const watcher = watch(
        dirPath,
        { recursive: false },
        (_eventType, filename) => {
          if (filename && filename.endsWith('.md')) {
            clearAgentCache()
            onChange?.()
          }
        },
      )
      watchers.push(watcher)
    } catch (err) {
      logError(err)
      debugLogger.warn('AGENT_LOADER_WATCH_FAILED', {
        dirPath,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
```

---

## B6) Skills / Slash Commands（项目/用户/legacy/bundled/plugins 分层）

### B6.1 自定义 commands/skills 的发现顺序：`.kode` 优先 + `.claude` 兼容 + bundled skills + plugins

- 结论：`loadCustomCommands()` 同时加载：
  - 项目 `.kode/commands` / `.kode/skills`（向上遍历祖先目录）
  - 用户 `<userKodeBaseDir>/commands` / `<userKodeBaseDir>/skills`
  - legacy 项目 `.claude/...` 与用户 `~/.claude/...`
  - bundled `packages/builtin-skills/skills`（fallback `resources/skills`；通过 `require.resolve(...)` 推断）
  - session plugins 的 commands/skills
- 证据：`apps/cli/src/services/customCommands/loader.ts:29`

```ts
function tryResolveBundledSkillsDir(): string | null {
  const require = createRequire(import.meta.url)

  const candidates: string[] = []
  try {
    candidates.push(require.resolve('@shareai-lab/kode/package.json'))
  } catch {
    // ignore
  }
  try {
    candidates.push(require.resolve('../../../../../package.json'))
  } catch {
    // ignore
  }

  for (const pkgJsonPath of candidates) {
    const base = dirname(pkgJsonPath)

    const skillsDirCandidates = [
      join(base, 'packages', 'builtin-skills', 'skills'),
      join(base, 'resources', 'skills'),
    ]

    for (const skillsDir of skillsDirCandidates) {
      if (existsSync(skillsDir)) return skillsDir
    }
  }

  return null
}
```

- 证据：`apps/cli/src/services/customCommands/loader.ts:53`

```ts
function listAncestorDirs(startDir: string, maxDepth = 50): string[] {
  const out: string[] = []
  let current = resolve(startDir)
  for (let depth = 0; depth < maxDepth; depth += 1) {
    out.push(current)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return out
}

function discoverNestedProjectDirs(
  startDir: string,
  relativeDir: string,
): string[] {
  const discovered: string[] = []
  for (const base of listAncestorDirs(startDir)) {
    const candidate = join(base, relativeDir)
    if (existsSync(candidate)) discovered.push(candidate)
  }
  return discovered
}
```

- 证据：`apps/cli/src/services/customCommands/loader.ts:77`

```ts
export const loadCustomCommands = memoize(
  async (): Promise<CustomCommandWithScope[]> => {
    const cwd = getCwd()
    const userKodeBaseDir = getUserKodeBaseDir()
    const sessionPlugins = getSessionPlugins()

    const projectKodeCommandsDirs = discoverNestedProjectDirs(
      cwd,
      join('.kode', 'commands'),
    )
    const userKodeCommandsDir = join(userKodeBaseDir, 'commands')

    const projectLegacyCommandsDirs = discoverNestedProjectDirs(
      cwd,
      join('.claude', 'commands'),
    )
    const userLegacyCommandsDir = join(homedir(), '.claude', 'commands')

    const projectKodeSkillsDirs = discoverNestedProjectDirs(
      cwd,
      join('.kode', 'skills'),
    )
    const userKodeSkillsDir = join(userKodeBaseDir, 'skills')

    const projectLegacySkillsDirs = discoverNestedProjectDirs(
      cwd,
      join('.claude', 'skills'),
    )
    const userLegacySkillsDir = join(homedir(), '.claude', 'skills')
    const bundledSkillsDir = tryResolveBundledSkillsDir()
```

- 证据：`apps/cli/src/services/customCommands/loader.ts:180`

```ts
const pluginCommands: CustomCommandWithScope[] = []
if (sessionPlugins.length > 0) {
  for (const plugin of sessionPlugins) {
    for (const commandsDir of plugin.commandsDirs) {
      pluginCommands.push(
        ...loadPluginCommandsFromDir({
          pluginName: plugin.name,
          commandsDir,
          signal: abortController.signal,
        }),
      )
    }
    for (const skillsDir of plugin.skillsDirs) {
      pluginCommands.push(
        ...loadPluginSkillDirectoryCommandsFromBaseDir({
          pluginName: plugin.name,
          skillsDir,
        }),
      )
    }
  }
}
```

### B6.2 SlashCommandTool：明确提示 `.kode/commands` 与 legacy `.claude/commands` 兼容，并可注入 `allowedTools` 到 context

- 结论：SlashCommandTool 的 prompt 明确说明 `.kode/commands/*.md`（legacy `.claude/commands/*.md`）来源；执行时可通过 `contextModifier` 写入 `commandAllowedTools`，交给权限引擎生效。
- 证据：`packages/tools/src/tools/interaction/SlashCommandTool/SlashCommandTool.tsx:92`

```ts
  async prompt() {
    return `Execute a slash command within the main conversation

How slash commands work:
When you use this tool or when a user types a slash command, you will see <command-message>{name} is running…</command-message> followed by the expanded prompt. For example, if .kode/commands/foo.md contains "Print today's date", then /foo expands to that prompt in the next message. (Legacy compatibility: .claude/commands/*.md is also supported.)

Usage:
- \`command\` (required): The slash command to execute, including any arguments
- Example: \`command: "/review-pr 123"\`

IMPORTANT: Only use this tool for custom slash commands that are available in the current host. Do NOT use for:
- Built-in CLI commands (like /help, /clear, etc.)
- Commands you think might exist but are not available

Notes:
- When a user requests multiple slash commands, execute each one sequentially and check for <command-message>{name} is running…</command-message> to verify each has been processed
- Do not invoke a command that is already running. For example, if you see <command-message>foo is running…</command-message>, do NOT use this tool with "/foo" - process the expanded prompt in the following message
- If a user's command is not available, ask them to check the slash command file and consult the docs.
`
  },
```

- 证据：`packages/tools/src/tools/interaction/SlashCommandTool/SlashCommandTool.tsx:221`

```ts
    yield {
      type: 'result' as const,
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
      newMessages: [metaMessage, ...expandedMessages],
      contextModifier:
        allowedTools.length > 0 || model || maxThinkingTokens !== undefined
          ? {
              modifyContext(ctx) {
                const next = { ...ctx }

                if (allowedTools.length > 0) {
                  const prev = getCommandAllowedToolsFromContext(next)
                  next.options = {
                    ...(next.options || {}),
                    commandAllowedTools: [
                      ...new Set([...prev, ...allowedTools]),
                    ],
                  }
                }

                if (model) {
                  next.options = { ...(next.options || {}), model }
                }

                if (maxThinkingTokens !== undefined) {
                  next.options = {
                    ...(next.options || {}),
                    maxThinkingTokens,
                  }
                }

                return next
              },
            }
          : undefined,
    }
```

---

## B7) 会话持久化与恢复（jsonl under config/projects）

### B7.1 会话落盘 roots：读 roots = `resolveDataRoots().allRoots`；写 root = `getKodeRoot()`

- 结论：协议层会话存储 roots 通过 `getSessionStoreRoots()` 决定，读取时会遍历 `resolveDataRoots().allRoots`（包含 Kode primary + legacy read-compat roots）。
- 写入路径始终以 `getKodeRoot()` 为 primary 根目录（Kode-first）。
- 证据：`packages/protocol/src/utils/kodeAgentSessionLog.ts:82`

```ts
export function getSessionStoreRoots(): string[] {
  return resolveDataRoots().allRoots
}

function getPrimarySessionStoreRoot(): string {
  return getKodeRoot()
}
```

### B7.2 会话文件布局：`<root>/projects/<sanitizedCwd>/<sessionId>.jsonl`

- 结论：会话日志存储于 `projects/` 下；项目目录名为 `cwd` 的“仅字母数字 + 其它字符替换为 '-'”的 sanitize 结果。
- 证据：`packages/protocol/src/utils/kodeAgentSessionLog.ts:90`

```ts
export function sanitizeProjectNameForSessionStore(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

export function getSessionProjectsDir(): string {
  return join(getPrimarySessionStoreRoot(), 'projects')
}

export function getSessionProjectDir(cwd: string): string {
  return join(getSessionProjectsDir(), sanitizeProjectNameForSessionStore(cwd))
}

export function getSessionLogFilePath(args: {
  cwd: string
  sessionId: string
}): string {
  return join(getSessionProjectDir(args.cwd), `${args.sessionId}.jsonl`)
}
```

### B7.3 CLI resume/continue 逻辑：支持 selector、歧义报错、跨目录保护

- 结论：rootAction 支持 `--continue`（最近会话）与 `--resume [id/name]`（可选 selector）；并对歧义/跨目录/不存在场景输出明确错误。
- 证据：`apps/cli/src/entrypoints/cli/cliParser/rootAction.ts:256`

```ts
if (wantsContinue) {
  const latest = findMostRecentKodeAgentSessionId(cwd)
  if (!latest) {
    console.error('No conversation found to continue')
    process.exit(1)
  }
  initialMessages = loadKodeAgentSessionMessages({
    cwd,
    sessionId: latest,
  })
  resumedFromSessionId = latest
} else if (wantsResume) {
  if (resume === true) {
    needsResumeSelector = true
  } else {
    const identifier = String(resume)
    const resolved = resolveResumeSessionIdentifier({ cwd, identifier })
    if (resolved.kind === 'ok') {
      initialMessages = loadKodeAgentSessionMessages({
        cwd,
        sessionId: resolved.sessionId,
      })
      resumedFromSessionId = resolved.sessionId
    } else if (resolved.kind === 'different_directory') {
      console.error(
        resolved.otherCwd
          ? `Error: That session belongs to a different directory: ${resolved.otherCwd}`
          : `Error: That session belongs to a different directory.`,
      )
      process.exit(1)
    } else if (resolved.kind === 'ambiguous') {
      console.error(
        `Error: Multiple sessions match "${identifier}": ${resolved.matchingSessionIds.join(
          ', ',
        )}`,
      )
      process.exit(1)
    } else {
      console.error(
        `No conversation found with session ID or name: ${identifier}`,
      )
      process.exit(1)
    }
  }
}
```

---

## B8) 后台任务与输出落盘（tasks/\*.output）

### B8.1 TaskOutputStore：`<baseDir>/<sanitizedCwd>/tasks/<taskId>.output`

- 结论：runtime 层提供 `taskOutputStore`，把后台任务输出按 `taskId` 追加到 `.output` 文件（best-effort，不因落盘失败 crash）。
- 证据：`packages/runtime/src/taskOutputStore.ts:20`

```ts
// Compatibility: project directory is a sanitized cwd string.
function getProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

// Keep a stable root for the entire process lifetime (Kode does not process.chdir).
const PROJECT_ROOT = process.cwd()

export function getTaskOutputsDir(): string {
  return join(getKodeBaseDir(), getProjectDir(PROJECT_ROOT), 'tasks')
}

export function getTaskOutputFilePath(taskId: string): string {
  return join(getTaskOutputsDir(), `${taskId}.output`)
}

export function ensureTaskOutputsDirExists(): void {
  const dir = getTaskOutputsDir()
  if (existsSync(dir)) return
  mkdirSync(dir, { recursive: true })
}

export function touchTaskOutputFile(taskId: string): string {
  ensureTaskOutputsDirExists()
  const filePath = getTaskOutputFilePath(taskId)
  if (!existsSync(filePath)) {
    const parent = dirname(filePath)
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true })
    writeFileSync(filePath, '', 'utf8')
  }
  return filePath
}

export function appendTaskOutput(taskId: string, chunk: string): void {
  try {
    ensureTaskOutputsDirExists()
    appendFileSync(getTaskOutputFilePath(taskId), chunk, 'utf8')
  } catch {
    // Best-effort: never crash the session on output persistence failures.
  }
}
```

---

## B9) TUI/REPL（Ink + modal/fullscreen tool views + 热键）

### B9.1 Render pipeline：entrypoint → renderRepl → Ink render + KeypressProvider + REPL screen

- 结论：交互模式通过 `renderRepl()` 懒加载 Ink 与 REPL 组件，并包裹 `KeypressProvider`；与 Claude Code 类似，避免顶层 import 的冷启动成本。
- 证据：`apps/cli/src/entrypoints/cli/interactive/renderers.tsx:19`

```tsx
export async function renderRepl(
  props: any,
  renderContext: RenderOptions | undefined,
  deps?: { render?: RenderFn; REPL?: React.ComponentType<any> },
): Promise<void> {
  const render = deps?.render ?? (await import('ink')).render
  const REPL = deps?.REPL ?? (await import('#ui-ink/screens/REPL')).REPL
  renderWithTuiStdio(
    render,
    <KeypressProvider>
      <REPL {...props} />
    </KeypressProvider>,
    renderContext,
  )
}
```

### B9.2 REPL 组件结构：controller → view（React hook 架构）

- 结论：`REPL` 通过 `useReplController()` 产出 viewProps，并渲染 `REPLView`（逻辑/呈现分离）。
- 证据：`apps/cli/src/ui/screens/REPL/REPL.tsx:9`

```tsx
export function REPL(props: REPLProps): ReactNode {
  const viewProps = useReplController(props)
  return <REPLView {...viewProps} />
}
```

### B9.3 Fullscreen 工具视图：在主 buffer 下临时切换 alternate screen（保留 scrollback）

- 结论：当 `displayMode: 'fullscreen'` 的 tool view 打开/切换时，REPL controller 会在“未启用 alternate buffer”场景下临时进入 alternate screen，并清屏以避免 Ink 重排导致的残影。
- 证据：`apps/cli/src/ui/screens/REPL/useReplController.tsx:145`

```ts
  const setToolJSXWithClear = useCallback(
    (next: typeof toolJSX) => {
      const prevMode = toolJSXRef.current?.displayMode
      const nextMode = next?.displayMode

      const prevFull = prevMode === 'fullscreen'
      const nextFull = nextMode === 'fullscreen'

      const screenReaderEnv =
        process.env.KODE_SCREEN_READER ?? process.env.SCREENREADER
      const canUseAltScreen =
        process.stdin.isTTY && process.stdout.isTTY && !screenReaderEnv

      const useEphemeralAltScreen =
        canUseAltScreen && getGlobalConfig().useAlternateBuffer !== true

      // When running in the main buffer (scrollback enabled), opening a fullscreen
      // TUI view leaves the entire screen in scrollback. To preserve scrollback
      // while keeping fullscreen dialogs clean, temporarily switch to the
      // terminal alternate screen for fullscreen tool views.
      if (useEphemeralAltScreen) {
        if (!prevFull && nextFull) {
          enterAlternateScreen()
          void clearViewport()
          ephemeralFullscreenAltScreenRef.current = true
        } else if (prevFull && !nextFull) {
          if (ephemeralFullscreenAltScreenRef.current) {
            ephemeralFullscreenAltScreenRef.current = false
            exitAlternateScreen()
          }
        } else if (
          prevFull &&
          nextFull &&
          ephemeralFullscreenAltScreenRef.current
        ) {
          // Ensure clean transitions between fullscreen tool screens.
          void clearViewport()
        }
      } else {
        if (prevFull !== nextFull) {
          // Clear immediately before the first paint to avoid "sometimes starts high/sometimes low"
          // artifacts caused by Ink's dynamic region reconciliation.
          void clearViewport()
        }
      }
```

### B9.4 快捷键：F1..F7 打开全屏 overlays（help/config/open/console/notifications/transcript/command palette）

- 结论：REPL keypress handler 在“无 modal”场景响应 F1..F7，打开对应全屏 overlay（`displayMode: 'fullscreen'`）。
- 证据：`apps/cli/src/ui/screens/REPL/useReplController.tsx:245`

```tsx
      if (key.name === 'f1') {
        openToolView({
          jsx: (
            <HelpScreen commands={props.commands} onDone={dismissToolView} />
          ),
          shouldHidePromptInput: true,
          displayMode: 'fullscreen',
        })
        return true
      }

      if (key.name === 'f2') {
        openToolView({
          jsx: <ConfigScreen onClose={dismissToolView} />,
          shouldHidePromptInput: true,
          displayMode: 'fullscreen',
        })
        return true
      }

      if (key.name === 'f3') {
        openToolView({
          jsx: <OpenFileScreen onDone={dismissToolView} />,
          shouldHidePromptInput: true,
          displayMode: 'fullscreen',
        })
        return true
      }

      if (key.name === 'f4') {
        openToolView({
          jsx: <ConsoleScreen onDone={dismissToolView} />,
          shouldHidePromptInput: true,
          displayMode: 'fullscreen',
        })
        return true
      }

      if (key.name === 'f5') {
        openToolView({
          jsx: <NotificationsScreen onDone={dismissToolView} />,
          shouldHidePromptInput: true,
          displayMode: 'fullscreen',
        })
        return true
      }

      if (key.name === 'f6') {
        openToolView({
          jsx: (
            <TranscriptScreen
              onDone={dismissToolView}
              label={`${props.messageLogName}-${forkNumber}`}
            />
          ),
          shouldHidePromptInput: true,
          displayMode: 'fullscreen',
        })
        return true
      }

      if (key.name === 'f7') {
        openToolView({
          jsx: (
            <CommandPaletteScreen
              onDone={action => {
                if (!action) {
                  dismissToolView()
                  return
                }

                if (action === 'help') {
                  openToolView({
                    jsx: (
                      <HelpScreen
```
