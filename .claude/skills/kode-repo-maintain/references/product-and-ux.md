# Product + UX guardrails (post-human, low-friction)

Load this when you are changing:

- onboarding/help/capabilities UX
- any “setup/install/config” experience
- flows that affect first-time success (TTFS) or repeat usage loops
- anything that could add recurring friction (extra prompts, brittle prerequisites)

## Product intent (short)

Kode is designed for **post-human workflows**: one operator coordinating many parallel actions across human–computer tasks. The CLI is the “unit agent” interface that makes tool execution, context, permissions, memory, and collaboration feel coherent and low-friction.
The system is built to support multi-model profiles, sub-agents, and collaborative execution without sacrificing predictability.

Deeper product context (when needed):

- `docs/product/11_post_human_blueprint.md`
- `docs/product/31_upgrade_plan.md`

## UX baseline (what good looks like)

- **Fast feedback**: users should always know what is happening and why.
- **Predictable guardrails**: permission prompts and safety checks should be understandable and consistent.
- **Resilient defaults**: avoid fragile dependencies; provide graceful fallbacks.
- **Composable execution**: prefer small primitives that can be orchestrated over monolithic wizards.

## No hard menus (meta/self-bootstrapping principle)

Kode should avoid rigid, menu-driven mechanisms as the _primary_ path — not only for install/setup, but for ongoing feature usage and configuration.

Treat capability management as part of the agent CLI experience:

- Prefer **intent-driven commands/screens** (capability status + guided actions) over “go to menu X → pick option Y → copy/paste Z”.
- Prefer the agent using its own interaction tools (SlashCommand/Task/Skill) to perform setup steps with verification.
- When adding a new capability, ensure there is a **single obvious entrypoint** for users (“enable/configure X”) rather than a scattered set of setup commands.

### Capability lifecycle (how users actually experience features)

Design each capability as a loop the agent can drive end-to-end:

1. **Discover**: “what is available / what’s enabled”
2. **Configure**: “set/change one thing” (minimal questions)
3. **Verify**: show a concrete success signal
4. **Operate**: use it in real work (no extra ceremony)
5. **Debug**: explain failures with evidence + next step
6. **Evolve**: adjust safely without breaking existing setups

### Anti-patterns (NEVER)

- NEVER add a long “copy/paste these commands” onboarding flow as the default path.
- NEVER require unrelated third-party endpoints for core flows (especially hidden “preflight” checks).
- NEVER ship setup that can’t be verified (every setup step should have a re-check).
- NEVER create “only works if you know the hidden subcommand” UX; discovery should be first-class.

## Design checklist (use before shipping UX changes)

1. **Trigger clarity**: is there an obvious “when to use” entrypoint?
2. **Minimal questions**: ask only when a choice is genuinely required.
3. **Safe defaults**: choose a sensible default path that works for most users.
4. **Atomic verification**: after each step, show a concrete success signal (status screen, file readback, minimal operation).
5. **Failure mode**: if it fails, does the user see an actionable reason and a next step?

## Implementation pointers (where UX lives)

- Ink UI: `apps/cli/src/ui/**`
- Onboarding screens: `apps/cli/src/ui/screens/setup/**`
- Command entrypoints: `apps/cli/src/commands/**`
- Capability-style flows: `apps/cli/src/commands/builtin/capabilities.ts`
