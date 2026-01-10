# AGENTS.md

This file provides guidance to Kode automation agents (including those compatible with the `.claude` ecosystem) when working with code in this repository.

## Development Commands

### Essential Development Workflow
```bash
# Install dependencies
bun install

# Run in development mode (hot reload with verbose output)
bun run dev

# Build the CLI wrapper for distribution
bun run build

# Clean build artifacts
bun run clean

# Run tests
bun test

# Check types
bun run typecheck

# Format code
bun run format
bun run format:check
```

### Build System Details
- **Primary Build Tool**: Bun (required for development)
- **Distribution**: Smart CLI wrapper (`cli.js`) that prefers cached native binary, then falls back to Node.js (`dist/index.js`)
- **Entry Points**: `apps/kode/src/index.ts` (dispatch) + `apps/kode/src/entrypoints/cli.tsx` (TUI)
- **Build Output**: `cli.js` (executable wrapper) and `.npmrc` (npm configuration)

### Publishing
```bash
# Publish to npm (requires build first)
npm publish
# Or with bundled dependency check skip:
SKIP_BUNDLED_CHECK=true npm publish
```

## High-Level Architecture

### Core System Design
Kode implements a **three-layer parallel architecture** refined for fast iteration across terminal workflows while remaining compatible with the `.claude` agent ecosystem:

1. **User Interaction Layer** (`ui/ink/src/screens/REPL.tsx`)
   - Interactive terminal interface using Ink (React for CLI)
   - Command parsing and user input handling
   - Real-time UI updates and syntax highlighting

2. **Orchestration Layer** (`packages/tools-builtin/src/tools/ai/TaskTool/`)
   - Dynamic agent system for task delegation
   - Multi-model collaboration and switching
   - Context management and conversation continuity

3. **Tool Execution Layer** (`packages/tools-builtin/src/tools/`)
   - Specialized tools for different capabilities (File I/O, Bash, Grep, etc.)
   - Permission system for secure tool access
   - MCP (Model Context Protocol) integration

### Multi-Model Architecture
**Key Innovation**: Unlike single-model systems, Kode supports unlimited AI models with intelligent collaboration:

- **ModelManager** (`packages/core/src/utils/model.ts`): Unified model configuration and switching
- **Model Profiles**: Each model has independent API endpoints, authentication, and capabilities
- **Model Pointers**: Default models for different purposes (main, task, reasoning, quick)
- **Dynamic Switching**: Runtime model changes without session restart

### Agent System (`packages/core/src/utils/agentLoader.ts`)
**Dynamic Agent Configuration Loading** with 5-tier priority system:
1. Built-in (code-embedded)
2. `~/.claude/agents/` (`.claude` user directory compatibility)
3. `~/.kode/agents/` (Kode user)
4. `./.claude/agents/` (`.claude` project directory compatibility)
5. `./.kode/agents/` (Kode project)

Agents are defined as markdown files with YAML frontmatter:
```markdown
---
name: agent-name
description: "When to use this agent"
tools: ["FileRead", "Bash"] # or "*" for all tools
model: model-name # optional
---

System prompt content here...
```

### Tool Architecture
Each tool follows a consistent pattern in `packages/tools-builtin/src/tools/<domain>/<ToolName>/`:
- `[ToolName].tsx`: Main tool implementation (UI presenters live under `ui/ink`)
- `prompt.ts`: Tool-specific system prompts
- Tool schema using Zod for validation
- Permission-aware execution

### Service Layer
- **LLM Service** (`packages/core/src/services/llm.ts`): Main LLM integration (Anthropic/OpenAI-compatible)
- **OpenAI Service** (`packages/core/src/services/openai.ts`): OpenAI-compatible models
- **Model Adapter Factory** (`packages/core/src/services/modelAdapterFactory.ts`): Unified model interface
- **MCP Client** (`packages/core/src/services/mcpClient.ts`): Model Context Protocol for tool extensions

### Configuration System (`packages/config/src/index.ts`)
**Hierarchical Configuration** supporting:
- Global config (`~/.kode.json`)
- Project config (`./.kode.json`)
- Environment variables
- CLI parameter overrides
- Multi-model profile management

### Context Management
- **Project Context** (`packages/core/src/context/`): Codebase understanding and file relationships
- **Session protocol** (`packages/core/src/utils/protocol/`): stream-json session persistence helpers
- **Tool presenters** (`ui/ink/src/toolPresenters/`): TUI rendering for tool results

### Permission System (`packages/core/src/permissions/`)
**Security-First Tool Access**:
- Granular permission requests for each tool use
- User approval required for file modifications and command execution
- Tool capability filtering based on agent configuration
- Secure file path validation and sandboxing

## Important Implementation Details

### Async Tool Descriptions
**Critical**: Tool descriptions are async functions that must be awaited:
```typescript
// INCORRECT
const description = tool.description

// CORRECT
const description = typeof tool.description === 'function' 
  ? await tool.description() 
  : tool.description
```

### Agent Loading Performance
- **Memoization**: LRU cache to avoid repeated file I/O
- **Hot Reload**: File system watchers for real-time agent updates
- **Parallel Loading**: All agent directories scanned concurrently

### UI Framework Integration
- **Ink**: React-based terminal UI framework
- **Component Structure**: Follows React patterns with hooks and context
- **Terminal Handling**: Custom input handling for complex interactions

### Error Handling Strategy
- **Graceful Degradation**: System continues with built-in agents if loading fails
- **User-Friendly Errors**: Clear error messages with suggested fixes
- **Debug Logging**: Comprehensive logging system (`packages/core/src/utils/debugLogger.ts`)

### TypeScript Integration
- **Strict Types**: Full TypeScript coverage with strict mode
- **Zod Schemas**: Runtime validation for all external data
- **Tool Typing**: Consistent `Tool` interface for all tools

## Key Files for Understanding the System

### Core Entry Points
- `apps/kode/src/index.ts`: Unified dispatch entry (help-lite/version early return)
- `apps/kode/src/entrypoints/cli.tsx`: Main CLI application entry (Ink TUI)
- `ui/ink/src/screens/REPL.tsx`: Interactive terminal interface

### Tool System
- `packages/tools-builtin/src/registry.ts`: Tool registry and exports
- `packages/core/src/tooling/Tool.ts`: Base tool interface definition
- `packages/tools-builtin/src/tools/ai/TaskTool/TaskTool.tsx`: Agent orchestration tool

### Configuration & Model Management
- `packages/config/src/index.ts`: Configuration management
- `packages/core/src/utils/model.ts`: Model manager and switching logic
- `packages/core/src/utils/agentLoader.ts`: Dynamic agent configuration loading

### Services & Integrations
- `packages/core/src/services/llm.ts`: Main AI service integration
- `packages/core/src/services/mcpClient.ts`: MCP tool integration

## Debugging & Forensics (Bash Tool / LLM Gate / Session Storage)

When debugging “Bash tool didn’t run / background task didn’t start / LLM gate blocked unexpectedly”, inspect the persisted session artifacts under `~/.kode/`.

### Per-project data root
Kode stores data in a per-project directory derived from the working directory:
- `~/.kode/-Users-<you>-<path-to-project>/`
- Example for this repo: `~/.kode/-Users-baicai-Desktop-MyT-Kode-pr-Kode-cli/`

Useful subdirectories:
- `messages/`: conversation transcripts (includes tool_use + tool_result)
- `errors/`: error logs and structured dumps
- `tasks/`: background shell output files (`<bashId>.output`)

### Conversation transcripts (what actually happened)
- `~/.kode/.../messages/*.json`
- Each file contains the full turn history including `tool_use` blocks (e.g. `Bash`) and the corresponding `tool_result` content.

How to confirm whether a background Bash command truly started:
- Look for `Bash` tool_use with `run_in_background: true`.
- Confirm the tool result contains `toolUseResult.data.backgroundTaskId` / `bashId`.
- Then confirm `~/.kode/.../tasks/<bashId>.output` exists and is being appended.

If the tool result contains “Blocked: LLM intent gate …”, the command did not execute (fail-closed gate).

### Bash LLM intent gate debug dumps (why the gate failed)
When the gate fails closed (timeout / invalid output / API error), Kode writes a dedicated dump:
- `~/.kode/.../errors/bash-llm-gate/*.txt`

These dumps include:
- the gate input (USER_PROMPT / DESCRIPTION / COMMAND / CONTEXT)
- the raw gate output (and retry outputs, if any)
- the parse/timeout error that caused the fail-closed block

This is the canonical artifact to diagnose “model responded with analysis/markdown and did not follow the required format”.

### Quick triage recipe
1. Open the latest `messages/*.json` for the failing turn and determine whether the `Bash` tool_use was blocked vs executed.
2. If blocked by gate, open the newest `errors/bash-llm-gate/*.txt` and inspect gate I/O.
3. If executed in background, inspect `tasks/<bashId>.output`, then verify TaskOutput/KillShell sequencing.

## Development Patterns

### Adding New Tools
1. Create directory in `packages/tools-builtin/src/tools/<domain>/<ToolName>/`
2. Implement `[ToolName].tsx` following existing patterns
3. Add `prompt.ts` for tool-specific prompts
4. Register in `packages/tools-builtin/src/registry.ts`
5. Update tool permissions in agent configurations

### Adding New Commands
1. Create command file in `packages/core/src/commands/[command].tsx`
2. Implement command logic with Ink UI components
3. Register in `packages/core/src/commands.ts`
4. Add command to help system

### Model Integration
1. Add model profile to `packages/core/src/constants/models.ts`
2. Implement adapter if needed in `packages/core/src/services/ai/adapters/`
3. Update model capabilities in `packages/core/src/constants/modelCapabilities.ts`
4. Test with existing tool suite

### Agent Development
1. Create `.md` file with proper YAML frontmatter
2. Place in appropriate directory based on scope
3. Test with `/agents` command
4. Verify tool permissions work correctly
