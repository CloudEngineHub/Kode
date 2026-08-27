# apps/

Application layer - each app is a standalone entrypoint.

## Structure

```
apps/
├── cli/        # Terminal application (Ink TUI)
├── server/     # API server (HTTP/WebSocket)
└── web/        # Web frontend (React + Vite)
```

## Current Apps

### @kode/cli

Terminal-based interactive AI assistant with Ink TUI.

```bash
bun run dev:cli
```

### @kode/server

Headless API server providing HTTP/WebSocket endpoints.

```bash
bun run dev:server
```

### @kode/web

Browser-based frontend connecting to server via WebSocket.

```bash
bun run dev:web
```

## Build

```bash
# Build the distributable CLI, daemon, and Web UI
bun run build

# Build specific app
bun run build:cli
bun run build:server
bun run build:web
```
