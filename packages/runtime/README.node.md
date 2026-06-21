# packages/runtime-node

Node.js 运行时实现（默认/基线）。

用途：

- 为 `packages/runtime` 定义的 Runtime 接口提供 Node 实现（fs/spawn/env/os/clock/log）。
- 作为 core/headless engine 的默认运行时（生产 npm 包运行时为 Node.js）。
