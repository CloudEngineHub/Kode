# Agents / Subagents

Kode supports subagents (agent templates): Markdown files with YAML frontmatter that define a named subagent (`subagent_type`) with its own prompt, tool allowlist, and (optional) model preference.

Agents can be stored under `.kode/agents` (Kode-native) or `.claude/agents` (compatibility layout). Kode loads both.

This powers:

- `@run-agent-<agentType> ...` (mention system)
- The `Task` tool (`subagent_type: "<agentType>"`)
- The `/agents` interactive manager

## Quick Start

### Create / edit agents (interactive)

```text
kode
> /agents
```

Default write location (interactive `/agents`):

- Project: `./.kode/agents/<agentType>.md`
- User: `~/.kode/agents/<agentType>.md`

Kode also loads legacy `.claude/agents` (and will edit/delete there if that’s where the agent currently lives).

### Create an agent (manual)

Create `./.kode/agents/api-designer.md` (or `./.claude/agents/...` if you prefer the compatibility layout):

```md
---
name: api-designer
description: 'Design APIs with clear contracts and robust error handling'
tools: ['Read', 'Edit', 'Grep', 'Glob']
model: inherit
permissionMode: plan
forkContext: 'false'
---

You are an API design specialist. Focus on:

- clear interfaces and types
- compatibility, migrations, and versioning
- concrete, actionable output
```

Then use it:

```text
@run-agent-api-designer Propose an API for uploading files and tracking progress
```

## Agent File Format (Frontmatter)

Agents are Markdown files with YAML frontmatter + a prompt body.

Required:

- `name`: agent type (used as `subagent_type`)
- `description`: “when to use this agent” (supports `\\n` for line breaks)

Common optional fields:

- `tools`: `*` for all tools, or an allowlist (array or string). Supports tool specs like `Bash(git:*)`.
- `disallowedTools`: denylist applied after `tools` (also accepts `disallowed-tools` / `disallowed_tools`).
- `model` / `model_name`:
  - Compatibility aliases: `inherit`, `haiku`, `sonnet`, `opus`
  - Kode selectors (resolved via `/model` profiles + pointers):
    - pointer: `main | task | compact | quick`
    - profile name: e.g. `OpenAI Main`
    - modelName: e.g. `o3`, `qwen-coder`
    - provider-qualified: `provider:modelName` (or `provider:profileName`), e.g. `openai:o3`
- `permissionMode`: `default | acceptEdits | plan | bypassPermissions | dontAsk | delegate`
- `forkContext`: must be the **string** `"true"` or `"false"` (quoted). When `"true"`, the agent runs with a forked snapshot of the main-thread context and `model` is forced to `inherit`.

Model mapping notes (aliases → pointers):

- `inherit` keeps the parent model at runtime
- `opus` maps to the `main` pointer
- `sonnet` maps to the `task` pointer
- `haiku` maps to the `quick` pointer (set `quick` = `task` if you want haiku+sonnet to behave the same)

Notes:

- In subagent context, orchestration tools are removed regardless of configuration (e.g. `Task`, `TaskOutput`, `TaskStop` (legacy alias: `KillShell`), `EnterPlanMode`, `ExitPlanMode`, `AskUserQuestion`).

## Loading & Priority Order

Agents are loaded from multiple sources and merged by `name` (later wins):

1. built-in (always available)
2. plugins
3. user settings (from `~/.claude/agents` and `~/.kode/agents`)
4. project settings (from `./.claude/agents` and `./.kode/agents` in the directory tree)
5. CLI `--agents` (flagSettings)
6. policy-managed agents (system directory; highest priority)

## CLI Flags

### `--agents <json>`

Inject ephemeral agents for this run (useful in `--print` mode):

```bash
kode --agents '{"reviewer":{"description":"Review code","prompt":"Be strict.","tools":["Read","Grep"]}}'
```

### `--setting-sources <sources>`

Control which settings sources are loaded (comma-separated):

- `user` → user agents/styles
- `project` → project agents/styles
- `local` → local settings (e.g. output style selection)

Example: ignore local settings and only load user/project:

```bash
kode --setting-sources user,project
```

## Troubleshooting

- Agent not found: ensure file is in `.claude/agents` (or `.kode/agents`) and frontmatter contains both `name` + `description`.
- Tool mismatch: verify tool names match Kode’s tool names (use the list shown in `/agents` UI).

This allows programmatic use of agents in automation and scripts.

## CLI Utilities

### Validate agent templates

```bash
# Validate project/user agent dirs (default)
kode agents validate

# Validate specific files/dirs
kode agents validate ./.claude/agents ./some-agent.md

# Machine-readable output
kode agents validate --json
```

### List configured models

```bash
kode models list
kode models list --json
```

## Future Enhancements

Planned improvements:

- Agent templates and inheritance
- Performance metrics per agent
- Agent composition (agents using other agents)
- Cloud-based agent sharing
- Agent versioning and rollback
