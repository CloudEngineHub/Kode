# Kode CLI 升级计划（T12–T31）落地总结

> 本文用于收口 `todo_tasks.json` 中的工程落地任务（T12–T31）：在 **Kode-first** 前提下尽量对齐 Claude Code 的关键机制，并把 Kode 的定位扩展到“every human & computer task”的通用人机协作工作流。

## 1. 范围与真相源

- 真相源：`todo_tasks.json`（T01–T31 的任务拆解与状态）。
- Claude Code 研究证据：`docs/research/claude-code/**`（指纹化清点、changelog 全量索引、文件映射、cli.js/wasm/SDK 类型分析、UX stringbook、差异矩阵等）。
- 产品蓝图：`docs/product/11_post_human_blueprint.md`（最小摩擦默认路径 + 对齐/超越策略）。

## 2. 20+ 改进点（T12–T31）

> 说明：这里以“任务=改进点”的粒度列出（每个 task 是一个可一次性完成的原子落地单元）。

| Task | 状态    | 改进点摘要                                                                              |
| ---- | ------- | --------------------------------------------------------------------------------------- |
| T12  | success | 数据目录策略：`.kode` 优先 + `.claude` 兼容（resolver + 回归测试）                      |
| T13  | success | 迁移能力：只读发现 + 显式导入 legacy 会话/转录到 `.kode`                                |
| T14  | success | Forensics 收口：失败可证据化（含 Kode 的 bash gate failure dump；官方路径仍需动态核验） |
| T15  | success | 后台任务可观测性：稳定落盘 + UI 可定位/可终止/可读输出                                  |
| T16  | success | 会话持久化/恢复可靠性：可恢复、可解释、可导入（兼容面最小化）                           |
| T17  | success | 权限引擎修复：`allowedTools` 约束合并入统一规则引擎并一致提示                           |
| T18  | success | 子代理权限继承：继承 toolPermissionContext + invoking constraints，禁止自动升权         |
| T19  | success | async tool description：统一 await/resolve，避免 UI/选择/权限逻辑错误                   |
| T20  | success | 工具命名/别名系统：兼容 legacy 生态，同时保持 Kode-first canonical id                   |
| T21  | success | agentLoader 确定性优先级 + 并行扫描：`.kode` 优先 `.claude` 兼容                        |
| T22  | success | agentLoader LRU memoization：减少重复 I/O 提升启动/刷新性能                             |
| T23  | success | agentLoader watcher 热更新：低打断刷新反馈 + 可靠变更侦测                               |
| T24  | success | skills 分层发现与按需加载：bundled + user + project + legacy compat                     |
| T25  | success | 内置 skills：覆盖高频低摩擦工作流（能力检查/权限排障/恢复/任务管理）                    |
| T26  | success | `/capabilities`：agent-driven 自检/修复入口，避免“安装菜单式”流程                       |
| T27  | success | onboarding：最小打断、一次性完成、可跳过、可后补齐                                      |
| T28  | success | REPL 体感：输入/渲染稳定性回归加固，对齐优秀交互细节                                    |
| T29  | success | 协作执行 UX：任务树、状态、产物与并发取消的可视化与操作面板                             |
| T30  | success | 权限 UX：更可解释、默认更低打断、保持 fail-closed 安全底线                              |
| T31  | success | 去除不必要 Claude Code 参考痕迹（保留必要兼容层）+ 全量验证 + 收口总结                  |

## 3. Kode-first 兼容策略（收口要点）

- 目录与数据：canonical 永远写入 `.kode`，`.claude` 仅用于只读发现/显式导入/兼容读取。
- 兼容命名：优先使用 `compat_*`/`legacy_*` 语义；必要处保留 legacy alias（例如部分旧配置值与外部脚本约定）。
- 生态互操作：保留 `.claude`/`.claude-plugin` 等 on-disk 兼容面，但 UI/默认路径强调 Kode-first。

## 4. 验证清单（T31 完成时填写结果）

- `bun test` (pass)
- `bun run typecheck` (pass)
- `bun run format:check` (pass)
- `bun run build` (pass)
