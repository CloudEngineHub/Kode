# Tools + Permissions (schema-first, boundary-aware)

Load this when you are changing:

- a Tool implementation (`packages/tools/src/tools/**`)
- permission policies/engine (`packages/core/src/permissions/**`)
- network-facing behavior (WebFetch/WebSearch)
- subagent/tool constraint behavior (`allowedTools`)

## Tool authoring (repo conventions)

When adding/changing a tool, keep it:

- **Schema-first** (validate inputs/outputs)
- **Permission-aware** (clear boundaries; predictable prompts)
- **Composable** (prefer small primitives unless a workflow tool is clearly safer)

Typical steps:

1. Implement under `packages/tools/src/tools/<domain>/<ToolName>/`
2. Include `prompt.ts` and a Zod schema alongside the implementation
3. Register the tool in `packages/tools/src/registry.ts`
4. Add/update tests where there is adjacent coverage

## Key files (start here)

- Tool registry: `packages/tools/src/registry.ts`
- Permission engine + policies: `packages/core/src/permissions/**`
- Web policy defaults: `packages/core/src/permissions/policies/web.ts`
- WebFetch tool: `packages/tools/src/tools/network/WebFetchTool/**`
- WebSearch tool: `packages/tools/src/tools/search/WebSearchTool/**`

## Permission model (gotchas)

- `allowedTools` constraints must be merged into the same permission engine as persisted rules; otherwise constraints silently won’t apply.
- Subagents inherit the parent permission context and the invoking command’s constraints; they must not auto-escalate.

## Network tools (WebFetch/WebSearch) – baseline expectations

Network tools are a security boundary in an agentic system. Keep conservative defaults and low-friction UX:

- Avoid hidden coupling to unrelated third-party “preflight” endpoints for core behavior.
- Prefer capability detection and graceful fallbacks over brittle model-name hardcoding.
- Keep SSRF baseline checks (scheme allowlist, block URL credentials, block obvious private IP literals). If you add stronger checks (e.g., DNS resolution), keep them behind explicit “strict mode” options.

## Common pitfalls

- Returning huge payloads without pagination/limits (blows up context and hurts UX).
- Adding “smart” auto-approval that bypasses permission boundaries (unsafe in agentic execution).
- Over-fitting provider gating logic to a single model string instead of capability checks + fallback.

## Verification checklist

- Run `bun test` and confirm tool tests (if any) cover the changed paths.
- Ensure permission prompts still describe _what_ and _why_ clearly.
- Ensure network paths fail gracefully (fallback provider, clear error messages).
