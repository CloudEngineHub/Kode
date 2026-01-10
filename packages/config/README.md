# packages/config

配置系统（读取/写入、默认值、模型 profiles/pointers、repair/migrations）。

主要职责：

- 读取用户/项目配置（`~/.kode.json`、`./.kode.json` 等）
- 维护模型 profiles + pointers（`main/task/quick/compact`）与兼容别名
- 处理配置版本迁移与自动修复（best-effort，不影响默认流程）

入口与使用方：

- 入口：`packages/config/src/index.ts`（对外导出）
- 使用：`apps/kode/src/entrypoints/*` 在启动时 `enableConfigs()`，并在需要时做 repair/validation
