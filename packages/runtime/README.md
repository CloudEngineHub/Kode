# `@kode/runtime`

Private workspace package for filesystem, process, shell, sandbox, and
background-task runtime primitives.

- Shared contracts are exported from `src/types.ts` and `src/index.ts`.
- The Node.js baseline is implemented in `src/node.ts`.
- Bun-specific development and compiled-binary support is implemented in
  `src/bun.ts`.
- Shell and sandbox behavior lives under `src/shell/**`.

This package is internal to the monorepo and is not published independently.
