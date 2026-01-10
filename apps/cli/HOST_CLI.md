# packages/host-cli

CLI host（Commander + Ink wiring）。

- 目标：只负责 I/O 与呈现（TUI/print），复用 `#core/*` 与 `#tools-builtin/*`。
- 内部导入：推荐使用 `tsconfig.json` 的 `#...` paths（例如 `#core/*`、`#tools-builtin/*`、`#ui-ink/*`），避免维护大块 alias 列表。

入口：

- `apps/kode/src/entrypoints/cli.tsx` 会调用 `parseArgs(...)`（来自 `packages/host-cli/src/index.ts`）。

开发定位：

- CLI 参数与子命令注册：`packages/host-cli/src/app/entrypoints/cli/cliParser.tsx`
- 交互式 UI：`ui/ink/src/screens/REPL.tsx`
