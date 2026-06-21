# packages/tools-builtin

内置工具集合（能力实现；UI 呈现逐步迁移到 host）。

包含：

- 工具注册表：`packages/tools-builtin/src/registry.ts`（工具顺序与启用逻辑对外契约敏感）
- 所有内置工具实现位于 `packages/tools-builtin/src/tools/*`

UI 解耦：

- 工具能力在此包内实现；Host（TUI/WebUI）负责权限交互与最终呈现。
- 当前仍有部分工具保留了旧的 Ink/React 渲染函数（兼容层）；Ink Host 可通过 `ui/ink/src/toolPresenters/*` 覆盖/承接工具输出与拒绝消息渲染，逐步把展示逻辑从工具迁移到 Host。
