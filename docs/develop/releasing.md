# Releasing Kode (GitHub Actions)

Kode uses GitHub Actions to publish **npm packages** and **native binaries**.

## Required secrets

- `NPM_TOKEN`: npm access token with publish permissions for `@shareai-lab/kode`.

## Dev channel (main)

- Workflow: `.github/workflows/dev-release.yml`
- Trigger: every push to `main`
- Publishes:
  - npm dist-tag `dev`:
    - `@shareai-lab/kode` (main)
    - `@shareai-lab/kode-bin-<platform>-<arch>` (native CLI binary packages)
    - `@shareai-lab/kode-ripgrep-<platform>-<arch>` (ripgrep packages)
  - GitHub prereleases with matching tag `v<version>` and standalone binary assets `kode-<platform>-<arch>(.exe)`

The standalone binary build job runs `bun run build` (to include WebUI assets) and `bun run scripts/ensure-ripgrep.mjs --current-only` (to embed ripgrep for that platform), then `bun run build:binary`.

## Stable channel (tags)

- Workflow: `.github/workflows/npm-publish.yml`
- Trigger: push a stable tag matching `v*.*.*` (example: `v2.0.0`, pre-release tags are ignored)
- Validation: the tag must match `v<package.json version>` (workflow will fail otherwise)
- Publishes:
  - npm `latest`:
    - `@shareai-lab/kode` (main)
    - `@shareai-lab/kode-bin-<platform>-<arch>` (native CLI binary packages)
    - `@shareai-lab/kode-ripgrep-<platform>-<arch>` (ripgrep packages)
  - GitHub Release with standalone binary assets + `checksums-sha256.txt`

You can create tags via the manual workflow `.github/workflows/release.yml` (bumps version, syncs workspace versions, pushes commit+tag, and dispatches the stable release workflow).

## Prepublish checks

Publishing runs `scripts/prepublish-check.js` (via `prepublishOnly`) to ensure:

- Required runtime assets exist (`dist/*`, `dist/webui/index.html`, shims like `cli.js`/`mcp-cli.js`, `yoga.wasm`).
- `npm pack --dry-run` includes the expected files (guards against accidental `files` excludes).
- Optional per-platform binary packages and ripgrep packages are prepared (version match + non-empty `bin/*`).
