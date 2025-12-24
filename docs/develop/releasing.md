# Releasing Kode (GitHub Actions)

Kode uses GitHub Actions to publish **npm packages** and **native binaries**.

## Required secrets

- `NPM_TOKEN`: npm access token with publish permissions for `@shareai-lab/kode`.

## Dev channel (main)

- Workflow: `.github/workflows/dev-release.yml`
- Trigger: every push to `main`
- Publishes:
  - npm prerelease versions with dist-tag `dev` (e.g. `2.0.0-dev.123`)
  - GitHub prereleases with matching tag `v<version>` and binary assets `kode-<platform>-<arch>(.exe)`

## Stable channel (tags)

- Workflow: `.github/workflows/npm-publish.yml`
- Trigger: push a tag matching `v*` (example: `v2.0.0`)
- Validation: the tag must match `v<package.json version>` (workflow will fail otherwise)
- Publishes:
  - npm `latest` (non-interactive)
  - GitHub Release with binary assets + `checksums-sha256.txt`

You can create tags via the manual workflow `.github/workflows/release.yml` (bumps version, tags, pushes).
