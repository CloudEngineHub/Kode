# packages/core

Core Engine + shared domain modules（内部包）。

定位：

- 这里存放 Kode 的核心编排与共享领域模块（query/tool queue/hooks/session/permissions/context/services/utils/constants/types）。
- **真正可复用的“headless 执行入口”** 在 `packages/core/src/engine/*`（`runTurn` / `runTurnEvents`）。

边界说明（重要）：

- 引擎执行本身不要求 TTY；但仓库里仍有部分 CLI 交互相关实现（例如 `/commands` 的 Ink 视图）为了兼容与复用目前仍放在此包内。
- 若你想在外部项目复用能力，推荐优先使用本地 daemon（`kode --web`）+ `@shareai-lab/kode/daemon-client`，避免直接依赖内部模块。

关键入口：

- `packages/core/src/engine/index.ts`：headless turn runner
- `packages/core/src/query/index.ts`：LLM + tool pipeline
- `packages/core/src/permissions/index.ts`：权限系统（policy/store/keys）
