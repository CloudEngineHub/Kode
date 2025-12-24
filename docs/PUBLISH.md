# Publishing Kode to NPM

Kode publishing includes:

- npm package: `@shareai-lab/kode`
- native binaries (Bun `--compile`) as GitHub Release assets

## Automated releases (recommended)

Required secrets:

- `NPM_TOKEN`: npm access token with publish permissions.

Release channels:

- **Dev channel (main)**: `.github/workflows/dev-release.yml`
  - publishes npm dist-tag `dev` (e.g. `2.0.0-dev.123`)
  - creates a GitHub prerelease with tag `v<version>` and binary assets
- **Stable channel (tags)**: `.github/workflows/npm-publish.yml`
  - triggers on tags `v*` (example: `v2.0.0`)
  - validates the tag matches `package.json` version
  - builds binaries (matrix), uploads `checksums-sha256.txt`, publishes npm `latest`

See `docs/develop/releasing.md` for details.

## Pre-publish Checklist

1. **Update version** in package.json
2. **Run build**: `bun run build`
3. **Test locally**: `./cli.js --help`
4. **Run checks**: `bun run scripts/prepublish-check.js`

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
- ✅ Windows OOTB via native binary-first wrapper
- ✅ Dev vs stable channels (`@dev` dist-tag)
