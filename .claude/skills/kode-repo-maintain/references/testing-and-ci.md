# Testing + CI (keep changes verifiable)

Load this when you are:

- adding/changing tests
- debugging CI failures
- making behavior changes where a small regression test can prove correctness

## Local verification baseline

Run these before declaring “done”:

```bash
bun test
bun run typecheck
bun run format:check
```

## Test topology (where to look)

- Core unit tests: `packages/core/src/test/unit/**`
- Core integration tests: `packages/core/src/test/integration/**`
- Protocol tests: `packages/protocol/src/test/**`
- Runtime tests: `packages/runtime/src/test/**`
- Tool tests: `packages/tools/src/tools/**` (and any `*.test.ts` nearby)
- CLI/UI tests (Ink): `apps/cli/src/**` (look for `*.test.ts(x)`)

## Fast narrowing (avoid rerunning everything)

- Run a specific test file:
  - `bun test path/to/test-file.test.ts`
- Run a folder (best-effort):
  - `bun test packages/core/src/test/unit`

If you can’t easily narrow, run the baseline trio above.

## Adding tests (repo policy)

- Prefer a **small regression test** near existing coverage over broad end-to-end scaffolding.
- Test the behavior at the closest stable boundary:
  - pure utilities → unit tests
  - permission decisions → permission engine tests
  - CLI behavior → command tests (keep Ink rendering minimal where possible)
- Keep tests deterministic (avoid real network; avoid depending on local machine state unless explicitly part of the contract).

## CI awareness

- CI automation lives under `.github/workflows/**`.
- When changing build/release scripts, validate both:
  - local behavior (`bun run build`, etc.)
  - CI expectations (env vars, node/bun versions, artifact paths)

## Common pitfalls

- Fixing a flaky test by loosening assertions until it stops failing (prefer stabilizing the underlying behavior).
- Adding a large new test harness when there is already a nearby pattern to follow.
- Introducing network dependency into tests unintentionally.
