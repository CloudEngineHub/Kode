# Binary Distribution (Native First)

Kode prefers a **native executable** (especially for Windows users) and falls back to the Bun runtime when needed.

## Runtime selection order

The `kode`/`kwa`/`kd` entrypoint (`cli.js`) follows this order:

1. **Cached native binary**: `${KODE_BIN_DIR:-~/.kode/bin}/<version>/<platform>-<arch>/kode(.exe)`
2. **Bun fallback**: `bun dist/index.js ...args` (requires `bun` on `PATH`)
3. **Error with guidance** (install binary or Bun)

`--version` and `--help-lite` are handled directly by the wrapper and do not require Bun.

## Install-time binary fetch

On `postinstall`, Kode will best-effort download the native executable into the cache directory above:

- Default source: GitHub Releases
- Tag: `v<version>`
- Asset name: `kode-<platform>-<arch>(.exe)`

### Overrides

- **Mirror**: set `KODE_BINARY_BASE_URL` to a directory containing the assets (same asset names).
- **Disable download**: set `KODE_SKIP_BINARY_DOWNLOAD=1` (wrapper must use Bun fallback).

## Failure modes

- **Offline / GitHub blocked**: download is skipped/failed; install still succeeds; wrapper uses Bun fallback (or errors if Bun missing).
- **No permission to write cache dir**: download is skipped; wrapper uses Bun fallback.
- **Unsupported platform/arch**: download will fail unless a matching asset exists; wrapper uses Bun fallback.

