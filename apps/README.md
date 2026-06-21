# apps/

Application layer - each app is a standalone entrypoint.

## Structure

```
apps/
├── cli/        # Terminal application (Ink TUI)
├── server/     # API server (HTTP/WebSocket)
├── web/        # Web frontend (React + Vite)
├── vscode/     # [TODO] VSCode extension
└── desktop/    # [TODO] Electron desktop app
```

## Current Apps

### @kode/cli

Terminal-based interactive AI assistant with Ink TUI.

```bash
pnpm --filter @kode/cli dev
```

### @kode/server

Headless API server providing HTTP/WebSocket endpoints.

```bash
pnpm --filter @kode/server dev
```

### @kode/web

Browser-based frontend connecting to server via WebSocket.

```bash
pnpm --filter @kode/web dev
```

## Roadmap

### @kode/vscode (Planned)

> Status: Skeleton only. Implementation TBD.

VSCode extension integrating Kode into the editor. May be:

- Developed in this monorepo, or
- Split into a separate repository

### @kode/desktop (Planned)

> Status: Skeleton only. Implementation TBD.

Electron-based desktop application. May be:

- Developed in this monorepo, or
- Split into a separate repository

---

## Build

```bash
# Build all apps
pnpm build

# Build specific app
pnpm build:cli
pnpm build:server
pnpm build:web
```
