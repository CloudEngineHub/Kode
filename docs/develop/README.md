# Developer documentation

Start with the repository-level [architecture](../architecture.md) and
[project structure](../PROJECT_STRUCTURE.md). Maintained developer guides are:

- [Configuration](configuration.md)
- [Releasing](releasing.md)
- [System sandbox](../system-sandbox.md)
- [TUI architecture](../tui/README.md)

Development uses Bun 1.3.6 and the committed `bun.lock`:

```bash
bun install --frozen-lockfile
bun run format:check
bun run architecture:check
bun run security:audit
bun run typecheck
bun test
bun run build
```

CI runs formatting, architecture checks, typechecking and the full test suite
once on Linux. macOS and Windows run the focused shell, sandbox, editor and CLI
regressions on native runners. All three platforms build the application.
Independent checks still run after another check fails, so the job reports all
failures instead of skipping validation after the first error.

`bun test` discovers every workspace test file and runs each in a fresh Bun
process with a temporary configuration directory. This isolates module mocks,
environment changes and caches on the pinned Bun 1.3.6 runtime. A missing test
completion summary is a failure even when a child exits with code zero. Linux
CI installs `bubblewrap` and `socat`; `KODE_REQUIRE_SANDBOX_TESTS=1` makes missing
socket capabilities or bridge prerequisites fail instead of silently skipping
the network integration tests. Restricted development environments may skip
those integrations explicitly.

The CI dependency gate compares the current lockfile with the trusted event
base commit and blocks newly introduced high/critical package-version/advisory
combinations. Both locks use the same advisory set. Existing vulnerabilities
remain visible in the job summary; this policy does **not** declare them fixed.
Registry failures and malformed responses fail the check. The full
`bun run security:audit` command above remains blocking for release validation.
