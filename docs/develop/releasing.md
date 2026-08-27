# Releasing Kode

`.github/workflows/npm-publish.yml` is the only supported publishing path. It
publishes the main package, all native-binary packages, all ripgrep packages,
and the matching GitHub release from one source tag.

## One-time repository configuration

1. Create a protected GitHub environment named `npm` and require release-owner
   approval.
2. In npm, configure `.github/workflows/npm-publish.yml` as the trusted GitHub
   publisher for every `@shareai-lab/kode*` package.
3. Protect `main` and `v*` tags. Require CI and reviewed pull requests.
4. After one successful OIDC release, remove the legacy `NPM_TOKEN` secret and
   revoke the corresponding npm automation token.

The workflow uses GitHub OIDC (`id-token: write`) and npm provenance. Publishing
from a workstation is intentionally unsupported.

## Release procedure

1. Update `package.json` and the platform-package manifests together:

   ```bash
   node scripts/set-version.mjs 2.3.0
   ```

2. Open and merge a version-only pull request after CI passes.
3. From the exact merge commit, create and push an annotated tag:

   ```bash
   git tag -a v2.3.0 -m "Kode v2.3.0"
   git push origin v2.3.0
   ```

4. Verify the workflow, npm provenance, dist-tags, packaged smoke test, GitHub
   assets, and `checksums-sha256.txt`.

Stable tags such as `v2.3.0` publish under `latest`. SemVer prerelease tags such
as `v2.3.0-dev.1` publish under `dev` and create a GitHub prerelease.

## Release invariants

- The tag must exactly equal `v${package.json.version}`.
- Dependencies install from committed `bun.lock` with `--frozen-lockfile`.
- Format, architecture boundaries, the high/critical dependency audit, types,
  tests, build, packlist checks, and packaged-install smoke tests pass before
  publication. Moderate advisories must still be reviewed and documented; they
  are not silently ignored.
- Platform packages publish before the main package.
- Generated binaries, wrappers, Web UI output, and `dist/**` never enter Git.
- GitHub Actions are pinned to immutable commit SHAs.

Npm publication is not transactional across packages. If a platform package
publish succeeds and a later step fails, do not reuse or overwrite that version;
inspect npm state, finish only the missing packages when safe, and document the
incident before moving a dist-tag.
