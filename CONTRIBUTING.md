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
├── src/                    # Source code
│   ├── entrypoints/       # CLI and MCP entry points
│   ├── commands/          # Command implementations
│   ├── components/        # React/Ink UI components
│   ├── tools/            # AI tool implementations
│   ├── services/         # Core services
│   ├── hooks/            # React hooks
│   └── utils/            # Utilities
├── scripts/              # Build and utility scripts
├── docs/                 # Documentation
├── test/                 # Test files
└── cli.js               # Generated CLI wrapper
```

## Building

```bash
bun run build
```

This runs `scripts/build.ts` which creates:
- `cli.js` - Smart runtime wrapper
- `.npmrc` - NPM configuration

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
- No Chinese in code or comments
- Follow existing patterns

## Git Hooks & CI Gating

This repo uses Husky to keep changes consistent:

- Pre-commit runs `bun run format:check` and `bun run typecheck`.
- CI runs `bun run format:check`, `bun run typecheck`, `bun test`, and `bun run build` on macOS/Linux/Windows.

If you need to bypass hooks locally (not recommended), you can use:

- `git commit --no-verify`
- or `HUSKY=0 git commit ...`

## Publishing

See [docs/PUBLISH.md](docs/PUBLISH.md) for publishing instructions.
