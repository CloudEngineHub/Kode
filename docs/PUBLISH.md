# Publishing Kode to NPM

Kode publishing includes:

- npm package: `@shareai-lab/kode`
- per-platform native CLI binaries (npm optional deps): `@shareai-lab/kode-bin-<platform>-<arch>`
- per-platform ripgrep binaries (npm optional deps): `@shareai-lab/kode-ripgrep-<platform>-<arch>`
- standalone single-file binaries (Bun `--compile`) as GitHub Release assets

## Automated releases (recommended)

Required secrets:

- `NPM_TOKEN`: npm access token with publish permissions.

Release channels:

- **Dev channel (main)**: `.github/workflows/dev-release.yml`
  - publishes npm dist-tag `dev` (e.g. `2.0.0-dev.123`)
  - creates a GitHub prerelease with tag `v<version>` and binary assets
- **Stable channel (tags)**: `.github/workflows/npm-publish.yml`
  - triggers on stable tags `v*.*.*` (example: `v2.0.0`, pre-release tags are ignored)
  - validates the tag matches `package.json` version
  - builds binaries (matrix), uploads `checksums-sha256.txt`, publishes npm `latest` (platform packages first)

See `docs/develop/releasing.md` for details.

## Pre-publish Checklist

1. **Update version** in package.json
2. **Prepare platform binaries**:
   - ripgrep: `bun run scripts/ensure-ripgrep.mjs && node scripts/prepare-ripgrep-packages.mjs`
   - Kode: `node scripts/prepare-kode-bin-packages.mjs` (requires built/downloaded binaries)
3. **Run build**: `bun run build`
4. **Test locally**: `./cli.js --help` and `./mcp-cli.js --help`
5. **Run checks**: `bun run scripts/prepublish-check.js`

## Publishing Steps

```bash
# 1. Build
bun run build

# 2. Test
./cli.js --help

# 3. Publish
npm publish --access public
```

## Post-publish Verification

```bash
# Install globally
npm install -g @shareai-lab/kode

# Test
kode --help
```

## Key Features

- ✅ All-in-Bun builds (`bun build` + `bun build --compile`)
- ✅ npm-first install (no postinstall GitHub downloads)
- ✅ Optional standalone single-file binaries (GitHub Releases)
- ✅ Dev vs stable channels (`@dev` dist-tag)
