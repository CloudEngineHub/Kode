# packages/runtime

运行时抽象接口（fs/spawn/env/cwd/clock/log/...），供 core 使用。

说明：

- 该包以 types 为主，用于让 core 依赖“运行时能力接口”，而不是直接依赖具体平台实现。
- Node.js 基线实现位于 `packages/runtime-node`；可选的 Bun 实现位于 `packages/runtime-bun`。
- 当前仓库仍以 Bun 作为开发工具链，但 npm 运行时路径以 Node.js 为主（见 `docs/binary-distribution.md` 与 `scripts/cli-wrapper.cjs`）。
