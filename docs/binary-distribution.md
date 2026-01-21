# Standalone Binary Distribution (Bun --compile)

Kode has **two** official distribution paths:

1. **npm package (recommended)**: `@shareai-lab/kode` (ships a Node.js runtime entry, and optional per-platform native binaries).
2. **Standalone single-file binaries (optional)**: attached to GitHub Releases, built with `bun build --compile`.

The npm package does **not** download binaries from GitHub during install.

## How the standalone binary works

The GitHub Release asset is a **single executable file** built with Bun, but it embeds a zipped JS bundle and unpacks it on first run.

- Default cache location: `~/.kode/bundled/kode/<version>-<sha>/<platform>-<arch>/...`
- If that directory is not writable, it falls back to `os.tmpdir()`.

## npm distribution: native binary via optionalDependencies

The `kode`/`kwa`/`kd` entry wrapper (`cli.js`) prefers, in order:

1. **Native binary** from npm `optionalDependencies`: `@shareai-lab/kode-bin-<platform>-<arch>`
2. **Node.js runtime entry**: `node dist/index.js ...args`

If you install with `--no-optional` / `--omit=optional`, Kode still runs via the Node.js entrypoint (you just won't have the optional native binary / bundled ripgrep).

Windows ARM64 note: if the `win32-arm64` binary package is unavailable, Kode will attempt to use the `win32-x64` binary (x64 emulation).

## GitHub Release binaries (for “portable” usage)

Each release publishes assets named:

- `kode-<platform>-<arch>` (macOS/Linux)
- `kode-<platform>-<arch>.exe` (Windows)

and a `checksums-sha256.txt` file.

Example:

```bash
./kode-darwin-arm64 --version
```

## Building binaries locally (maintainers)

You must build on the target OS/arch (GitHub Actions does this via a matrix build).

```bash
bun install
# Optional but recommended: include WebUI + platform ripgrep in the binary payload
bun run build
bun run scripts/ensure-ripgrep.mjs --current-only
bun run build:binary
```

Output location:

- `dist/bin/<platform>-<arch>/kode(.exe)`

To prepare the npm binary platform packages from the built artifacts:

```bash
node scripts/prepare-kode-bin-packages.mjs
```

## Automated release pipeline

- Dev prereleases: `.github/workflows/dev-release.yml`
- Stable releases: `.github/workflows/npm-publish.yml`
