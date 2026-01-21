# Contributing to @shareai-lab/kode

## Development Setup

1. **Install Bun**
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Clone and Install**
   ```bash
   git clone https://github.com/shareAI-lab/kode.git
   cd kode
   bun install
   ```

3. **Run in Development**
   ```bash
   bun run dev
   ```

## Project Structure

```
.
├── apps/                  # Entrypoints (build to dist/)
├── packages/              # Internal workspace modules (core/protocol/tools/hosts/daemon/config/runtime)
├── scripts/               # Build and utility scripts
├── docs/                  # Documentation
├── new_plan/              # vNext architecture plan
├── examples/              # Integration examples / PoCs
└── cli.js                 # Generated CLI wrapper (built)
```

## Building

```bash
bun run build
```

This runs `scripts/build.mjs` which creates:
- `cli.js` / `cli-acp.js` - runtime wrappers
- `dist/**` - bundled runtime (Node) + assets

## Testing

```bash
# Run tests
bun test

# Test CLI
./cli.js --help
./cli.js -p "test prompt"
```

## Code Style

- Run `bun run format` before committing
- TypeScript/TSX for all source files
- Prefer English for code identifiers and comments (bilingual docs are OK)
- Follow existing patterns and keep changes focused

## Git Hooks & CI Gating

This repo uses Husky to keep changes consistent:

- Pre-commit runs `bun run format:check` and `bun run typecheck`.
- CI runs `bun run format:check`, `bun run typecheck`, `bun test`, and `bun run build` on macOS/Linux/Windows.

If you need to bypass hooks locally (not recommended), you can use:

- `git commit --no-verify`
- or `HUSKY=0 git commit ...`

## Publishing

See [docs/PUBLISH.md](docs/PUBLISH.md) for publishing instructions.
