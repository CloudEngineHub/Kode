# ui/web

Kode 的内置 WebUI（Vite/React）：

- 开发：`bun run dev:web`（Vite dev server）
- 打包：由仓库根目录 `bun run build` 统一产出到 `dist/webui/`，再由 daemon 静态托管

访问方式：

- 运行 `kode --web`（仅交互模式）后，打开终端打印的 URL（包含 `?token=...`）

实现要点：

- WebUI 通过 WS 连接本地 daemon（`/ws`），消费 `AgentEvent` 事件流并渲染 UI。
- 默认只绑定 `127.0.0.1` 并使用 token 保护，避免本机其它进程随意访问。
- 若当前目录是 git 仓库且配置了 `git worktree`，WebUI 会自动发现并在左侧支持切换多个 workspace（每个 worktree 作为独立工作区）。
