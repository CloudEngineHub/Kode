# ui/ink

Ink UI 组件库（TUI 渲染层）。

用途：

- 被 CLI host 复用：`apps/kode/src/entrypoints/cli.tsx` → `packages/host-cli` → `ui/ink`
- 渲染 REPL、对话消息、权限弹窗、工具调用 UI（presenters）

关键目录：

- `ui/ink/src/screens/`：主要屏幕（REPL、恢复会话等）
- `ui/ink/src/components/`：可复用 UI 组件
- `ui/ink/src/toolPresenters/`：工具 UI 渲染（与工具能力解耦）
- `ui/ink/src/context/`：权限/状态等 UI 上下文

开发建议：

- 保持 UI 纯呈现：不要在这里实现工具执行、权限决策或会话编排；这些应在 `packages/core` 完成。
