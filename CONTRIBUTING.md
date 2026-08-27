# Contributing to @shareai-lab/kode

## Development Setup

1. **Install Bun**

   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Clone and Install**

   ```bash
   git clone https://github.com/shareAI-lab/Kode-CLI.git
   cd kode
   bun install --frozen-lockfile
   ```

3. **Run in Development**
   ```bash
   bun run dev
   ```

## Project Structure

```
.
├── apps/                  # Entrypoints (build to dist/)
├── packages/              # Internal workspace modules and shipped assets
├── scripts/               # Build and utility scripts
├── docs/                  # Maintained user and developer documentation
├── examples/              # Copyable configuration examples
└── package.json           # Package boundary and development commands
```

## Building

```bash
bun run build
```

This runs `scripts/build.mjs` and creates ignored artifacts:

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
- CI also enforces architecture boundaries, audits high-severity dependency
  vulnerabilities, runs tests, and builds on macOS, Linux, and Windows.

Run the complete local gate before opening a release change:

```bash
bun run check
```

## Publishing

Publishing is CI-only. See [docs/develop/releasing.md](docs/develop/releasing.md).
