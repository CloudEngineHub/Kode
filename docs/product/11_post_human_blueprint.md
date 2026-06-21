# Kode CLI 产品设计蓝图（Post‑Human / Unit‑Agent / Minimal Friction）

> 核心定位：**Design for post‑human workflows**。Kode CLI 是一个面向“超级个体 / 超级公司”的通用人机协作系统：**One unit agent for every human & computer task**。  
> 本文目标：把愿景压缩成可执行的产品规格（默认行为、信息架构、交互范式、安全与权限策略、可发现性与可学习性），并把决策映射到工程任务（T12+）。

## 0. 约束与输入

- 本蓝图以差异矩阵为事实输入：`docs/research/10_delta_matrix.md`（D01–D40，含 P0/P1/P2 与 UX/Capability/Security/Reliability/Performance 主维度标注）。
- 目标不是“像 Claude Code”，而是：
  - **底线对齐**：关键机制与兼容面尽量对齐（目录/会话/日志/沙箱/工具 schema/导入回放）。
  - **场景扩展**：覆盖更广泛的“every human & computer task”（不仅是 vibe coding）。
  - **体感优先**：默认路径低打断、可解释、可回滚、可追溯。
- 项目策略约束（repo policy）：
  - **No hard install menus**：避免默认输出里出现“去跑 /x install /x doctor 菜单式流程”；改为 agent-driven 入口（例如 `/capabilities`）完成检查/修复并验证。
  - **Kode-first + legacy compat**：兼容 `.claude` 但 canonical 永远以 `.kode` 为主；不把 legacy 当成主路径。

---

## 1. 用户心智模型（Mental Model）

### 1.1 Unit‑Agent（单元代理）

- 用户把 Kode 理解为一个“**能做事的单元**”：输入意图 → 系统拆任务 → 执行工具 → 产出可复用的 artifacts。
- “Unit agent”不是一个人格，而是一个**可复用的执行单元**：同一个 CLI 入口，在不同任务上体现为不同的能力编排。

### 1.2 任务（Task）与对话（Session）

- **Session**：用户与 unit agent 的一段连续协作；可恢复、可追溯、可导入/导出。
- **Task**：Session 内的工作单元；可以是前台（foreground）也可以是后台（background）；可以有子任务树（subagents）。
- 关键：用户不需要理解内部实现（jsonl、tmpdir、tool-results），只需要知道：
  - “我现在在做什么任务”
  - “系统正在做什么”
  - “我怎么中断/继续/恢复”
  - “产物在哪、如何复用”

### 1.3 上下文（Context）与产物（Artifacts）

- Context 的层级（从低摩擦角度）：
  1. **当前项目上下文**（cwd / repo / files）
  2. **当前 session 上下文**（对话、todo、plan、权限状态）
  3. **可携带的知识**（skills / commands / memory）
  4. **可追溯产物**（logs / tool results / task outputs）
- Artifacts 的 UX 原则：默认“可用、可找、可清理”，并且可被 `/resume` 或导入流程重新挂载。

---

## 2. 默认交互范式（Default Interaction Pattern）

### 2.1 两种主模式：Talk + Orchestrate

- **Talk**（自然语言）：用户直接描述目标与约束；系统负责拆解、选择工具、生成计划与产物。
- **Orchestrate**（指令/技能/命令）：用户用最小指令触发可复用工作流：
  - slash commands（`/plan`、`/capabilities`、`/agents`、`/skills`、`/permissions` 等）
  - skills（按需加载、渐进披露；用于复杂但高频的排障/迁移/自检流程）

### 2.2 渐进披露（Progressive Disclosure）

- 默认屏幕只展示：当前任务摘要 + 关键下一步 + 最小的安全提示。
- 需要时可展开：详细日志、证据文件路径、工具输入输出、子任务树、失败原因。

### 2.3 可回滚（Rollbackable）与可恢复（Recoverable）

- “回滚”不只指代码回滚，而是交互回滚：撤销一次危险授权、撤销一次工具写入、回到上一步的 plan 或 todo 状态。
- “可恢复”是核心信任：崩溃后能继续，导入后能继续（D01/D02/D11/D12）。

---

## 3. 场景与路径（Key Scenarios）

### 3.1 个人（Individual）

- 快速做事：`kode <prompt>` → 系统执行 → 产物落盘 → 可 `--continue/--resume`
- 长任务：背景执行 + 输出可追踪（D09 / T15）
- 迁移：自动发现 `.claude` 数据并提示导入（D01/D02 / T12/T13）

### 3.2 团队（Team）

- 共享 skills/commands：项目级 `.kode/skills` / `.kode/commands`（T24/T25）
- 权限策略可共享：policy / project settings（T17/T30）
- 可复盘：每个关键失败有证据文件（T14）

### 3.3 企业（Enterprise）

- 可控网络/沙箱/日志：默认安全、最小授权、可审计（D14/D15/D22 / T30）
- log root 可重定向与集中采集（D22 / T31）
- onboarding 无菜单式折腾：一次性可完成、可跳过、可后补（T26/T27）

---

## 4. 与 Claude Code 对齐/超越策略（Alignment & Beyond）

### 4.1 对齐优先级（从差异矩阵抽象）

- **P0 对齐**：目录策略、会话/子代理落盘、工具结果持久化/marker、后台任务输出、沙箱失败可解释性（D01–D18）。
- **P1 对齐**：工具 schema 兼容（导入/回放）、解析/WASM 与打包形态（D19–D30）。
- **P2 扩展**：Kode 额外能力（skills/slash commands/LSP/MCP search 等），但保持 “Kode-first canonical + legacy alias” 的一致性（D31–D40）。

### 4.2 兼容原则（Kode‑first）

- 任何写入默认只写 `.kode`（D01/D02）。
- `.claude` 仅用于：只读发现、显式导入、迁移提示（T12/T13）。
- 命名/前缀：优先 `KODE_*`，必要时兼容 `CLAUDE_*`（D40 / T31）。

### 4.3 多 Provider 能力模型（Kode 扩展，但不破坏对齐底座）

> Claude Code 的默认假设偏 Anthropic 原生能力（例如 thinking block、工具调用协议细节）。Kode 需要在 “尽量 1:1 对齐” 与 “多 provider 通用性” 之间给出 **可预测的降级策略**。

- **能力显式化**：每个 model/provider profile 都应有 capability 描述（例如：tool calling、streaming、thinking/reasoning、image input、JSON/schema 严格度、max context 估算可靠性）。
- **UI 只展示可用能力**：例如 `Alt+T` thinking toggle、thinking 展示、某些 output-style 约束，应在不支持的 provider 上自动隐藏或降级为 no-op（并给出一次性提示，避免困惑）。
- **协议兼容优先于严格拒绝**：导入 Claude transcript 时，遇到 provider-specific 信号（如 thinking block、特定 marker）应 “能解析就解析，不能解析就忽略但不中断”，以保证 replay/恢复稳定。
- **对齐不被扩展破坏**：引入 Kode 扩展能力（多 provider、更多 tools、更多 hooks）必须通过 profile/compat mode 隔离，确保 Claude profile 下行为仍可 1:1 复现。

---

## 5. “最小摩擦”具体设计决策（≥30）

> 格式：**Decision** → 默认行为 → 关联差异/任务（Dxx / Txx）。

### 数据目录 / 会话 / 取证

1. **默认只写 `.kode`，永不隐式写 `.claude`** → `.claude` 仅允许只读发现与显式导入 → D01/D02 → T12/T13
2. **检测到 `.claude` 数据时给出一次性、可跳过的迁移提示** → 提示包含“导入会发生什么/不会发生什么” → D01/D02 → T13/T27
3. **统一 dataRoot resolver（单入口）** → 所有路径调用点必须走 resolver → D01/D02/D38 → T12
4. **会话/子代理落盘路径提供兼容映射** → 导入时支持 Claude 的 `subagents/` 布局，并映射到 Kode canonical → D11 → T16/T13
5. **tool-results 目录布局提供兼容映射** → 识别 Claude `projects/<project>/<sessionId>/tool-results` 并可导入/回放 → D12 → T16/T13
6. **tool result marker 兼容** → 识别 `<persisted-output>...</persisted-output>` 并能跳转到真实文件 → D13 → T16
7. **错误/调试日志“可一跳定位”** → 为每次 session 提供 “latest” 或等价快速入口 → D04 → T15/T31
8. **错误日志格式可机器读** → 优先采用结构化（jsonl/json）并可兼容 Claude 的 `.jsonl` → D06 → T14/T31
9. **Retention 可配置** → 默认 30 天，但允许通过配置/策略调整为 0/更长 → D07 → T31
10. **Cleanup scope 明确且可解释** → 清理范围覆盖 plans/session logs/tool results/task outputs，并输出可追溯统计 → D08 → T31

### 后台任务 / 并发 / 可观测性

11. **后台任务输出文件路径稳定且可预测** → UI 显示 output file，并支持“一键查看/终止” → D09 → T15
12. **任务树视图是默认 affordance（可折叠）** → 主代理/子代理并发不互相覆盖输出 → D11 → T29
13. **任务输出与 Read/UX 打通** → 读取任务输出时 UI 明确显示“Read agent output/Reading plan”等语义标签 → D17 → T28/T29
14. **失败即证据** → 后台任务失败必须附：错误原因 + 日志路径 + 下一步 → D05/D06/D14 → T14/T15

### 权限 / 沙箱 / 安全 UX（低打断但不自动越权）

15. **默认 fail‑closed（安全优先），但提示可解释** → 任何 auto-deny 都必须给原因与最小授权建议 → D14 → T30
16. **沙箱失败格式可解析** → 统一采用 Claude `<sandbox_violations>` side-channel（Kode 不新增 prose marker）→ D14 → T30/T15
17. **子代理继承权限上下文** → subagent 不得自动升级权限 →（与 D11 的可观测性一起）→ T18/T30
18. **allowedTools 约束必须真实生效且一致提示** → 约束进入同一规则引擎 → T17/T30
19. **内部产物 allowlist 免打扰** → plan/memory/tool-results/task outputs/scratchpad 等路径免重复授权 → D16/D39 → T30/T15
20. **Linux 安全隔离层对齐策略明确** → 是否引入 seccomp 或等价能力需在设计中给出明确决策与兼容边界 → D15 → T31/T30

### 工具系统 / Schema 兼容 / 生态迁移

21. **工具 schema 兼容优先于“严格拒绝”** → 导入/回放时对未知字段做可控忽略/归一化 → D23/D24/D26–D29 → T16/T13
22. **ConfigInput 兼容入口** → 即便不做 ConfigTool，也要提供可映射的行为与错误提示 → D30 → T26/T27
23. **工具别名系统（Kode-first canonical）** → 兼容 Claude 生态常见工具名与旧名，但 UI 显示 canonical → D31–D37 → T20
24. **额外工具不破坏 Claude 兼容** → extra tools（Skill/SlashCommand/LSP/MCP search）以“可选能力层”呈现 → D31–D37 → T11/T20
25. **async tool description 必须被正确 await** → 所有 tool metadata 渲染统一走 resolver → D18 → T19

### Skills / Capabilities / Onboarding（无菜单式安装）

26. **skills 只在需要时加载正文** → 启动只读 frontmatter，按需加载 body/references → T24
27. **内置 skills 覆盖高频低摩擦流程** → capabilities、自检修复、权限排障、导入迁移 → T25
28. **/capabilities 是唯一推荐的环境自检入口** → 输出短、可展开、可验证、可一键修复 → T26
29. **首次启动 onboarding ≤3 步** → 可跳过、可后补、支持非交互模式 → T27
30. **任何“需要用户跑命令”的地方都要给替代路径** → 优先 agent-driven 执行并验证；必要时才给命令 → T26/T27

### 终端体感（REPL）

31. **默认信息密度低，但可展开** → 状态栏只显示任务摘要/进度/关键提示 → T28/T29
32. **输入稳定性优先** → 不在 REPL 中插入破坏输入的 mid-screen logs → T28
33. **关键交互一致的 affordance** → 取消/退出/确认/回滚的键位与文案一致 → T28/T30
34. **错误提示包含下一步** → 每个错误都包含可点击路径或可复制命令（最少一次跳转定位证据）→ T14/T30

### 清理与“去参考痕迹”

35. **兼容层存在但命名 Kode-first** → env 前缀/目录名/文案优先 Kode → D40 → T31
36. **代码库去除不必要 Claude 痕迹** → 不影响兼容；先机制对齐后再清理命名/文案 → T31

---

## 6. 蓝图到工程任务（落地路径）

- **P0 先行**：T12（dataRoot）→ T13（导入）→ T15（后台任务可观测）→ T16（会话/协议可靠性）→ T30（权限 UX）→ T31（收口与去痕）。
- **P1 并行**：T14（forensics dump）、T19（async description）、T20（tool aliases）。
- **能力扩展**：T24/T25/T26/T27（skills/capabilities/onboarding）、T28/T29（REPL/任务树）。
