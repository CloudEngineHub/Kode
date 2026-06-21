# Repo hygiene (keep the codebase clean and reviewable)

Load this when you are:

- cleaning noisy diffs
- adding/changing docs or “knowledge” files
- adjusting `.gitignore` / build artifacts / generated outputs
- doing large refactors that risk turning into churn

## Knowledge placement (where should this information live?)

Keep repo knowledge structured so agents can load it efficiently:

- `AGENTS.md` (always-on contract): short, stable rules + entrypoints. Avoid long procedures here.
- `./.claude/skills/kode-repo-maintain/` (this skill): workflow-heavy, scenario-driven guidance with progressive disclosure.
- `AGENT_CONTEXT/` (developer-facing): deeper background and design notes that don’t need to be loaded for every task.
- `docs/` (developer docs): longer references and explainers that humans may read; keep it curated (avoid one-off notes).
- `resources/skills/**` (runtime-shipped): knowledge that must be available to the running packaged agent.

Rule of thumb: if it’s a recurring workflow for agents, it belongs in the skill (often as a new `references/*.md`), not as an ad-hoc doc.

## Generated artifacts (avoid committing noise)

- Don’t commit build outputs (e.g. `dist/**`).
- Don’t commit local-serving copies of built web assets (notably `apps/server/static/**`).
- If a file changes on every build due to hashing, treat it as an artifact unless the repo explicitly wants built outputs tracked.

Bundled knowledge/skills:

- When changing `packages/builtin-skills/skills/**`, keep it reviewable and low-churn. If you vendor or remove third-party skills, update `packages/builtin-skills/THIRD_PARTY_NOTICES.md` accordingly and ensure license files are present where expected.

## Diff hygiene (how to keep reviews sane)

- Don’t mix:
  - refactors + behavior changes + formatting churn
  - generated outputs + source changes
- Keep renames/moves isolated when possible.
- Prefer small commits; if you must do a large change, keep it mechanically obvious and well-scoped.

## Doc hygiene (avoid “garbage docs”)

- Avoid one-off “notes.md” files in the repo root.
- Prefer updating an existing doc or adding a focused doc under `docs/` or `AGENT_CONTEXT/`.
- If the content is for agents, prefer adding/expanding a skill reference file instead.

## Common pitfalls

- “Just commit the built files” (usually creates perpetual noise and conflicts).
- Adding duplicated documentation in multiple places (causes drift).
- Turning a cleanup into a sweeping rewrite (hard to review; risky).
