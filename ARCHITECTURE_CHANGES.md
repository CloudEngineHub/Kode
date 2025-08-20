# Subagent System Architecture Changes

## Overview
Complete implementation of subagent system for Kode CLI, aligned with Claude Code's original Task tool design.

## Core Changes

### 1. Task Tool Enhancement (`src/tools/TaskTool/`)

#### Before:
- Simple task execution with model_name parameter
- No subagent concept
- Fixed "Task" display name
- No agent-specific configurations

#### After:
- Full subagent system with subagent_type parameter
- Dynamic agent loading and configuration
- Agent-specific display names and colors
- Tool filtering based on agent configuration
- Default to 'general-purpose' agent when not specified

**Key Files Modified:**
- `TaskTool.tsx`: Core implementation with subagent support
- `prompt.ts`: Dynamic prompt generation with agent descriptions

### 2. Agent Configuration System (`src/utils/agentLoader.ts`)

**New Component:**
- Dynamic agent loading from multiple directories
- Priority system: built-in < user < project
- File watcher for hot reload
- Memoized caching for performance

**Agent Configuration Structure:**
```typescript
interface AgentConfig {
  agentType: string          // Agent identifier
  whenToUse: string          // Usage description  
  tools: string[] | '*'      // Tool permissions
  systemPrompt: string       // Agent-specific prompt
  location: 'built-in' | 'user' | 'project'
  color?: string            // Optional UI color
  model?: string           // Optional model override
}
```

### 3. Agent Management UI (`src/commands/agents.tsx`)

**New Command:** `/agents`
- Interactive agent management interface
- Create, edit, delete, view agents
- Support for both `.claude/agents` and `.kode/agents` directories
- YAML frontmatter + markdown body format

### 4. UI Improvements

#### Before:
- `⏺ Task` for all task executions
- No visual distinction between agents
- Fixed display format

#### After:
- `⏺ [agent-name]` with agent-specific colors
- Dynamic color loading from configuration
- Clean display: `model: description`
- No emojis in tool display

**Components Modified:**
- `AssistantToolUseMessage.tsx`: Support for dynamic agent names
- `TaskToolMessage.tsx` (new): Dynamic color rendering for agents

### 5. AskExpertModel Tool Improvements

**Enhanced:**
- Better distinction from Task tool
- Dynamic model context in description
- Validation to prevent self-referential calls
- Improved error messages with available models

## Agent Directory Structure

```
project/
├── .kode/agents/          # Project-level agents (highest priority)
│   ├── dao-qi-harmony-designer.md
│   ├── code-writer.md
│   └── search-specialist.md
└── ~/.kode/agents/        # User-level agents
    └── custom-agent.md
```

## Workflow Changes

### Before Workflow:
1. User requests task
2. Task tool executes with specified model
3. Fixed "Task" display
4. No agent-specific behavior

### After Workflow:
1. User requests task (mentions agent or complex task)
2. Model selects appropriate subagent_type
3. Agent configuration loaded dynamically
4. Agent-specific:
   - System prompt applied
   - Tools filtered based on configuration
   - Display name and color shown
   - Model override if configured
5. Task executes with agent context

## Example Agent Configurations

### dao-qi-harmony-designer
```yaml
---
name: dao-qi-harmony-designer
description: Architecture and design harmony specialist
tools: ["Read", "Grep", "Glob", "LS"]
color: red
---
[System prompt content]
```

### code-writer
```yaml
---
name: code-writer
description: Specialized in writing and modifying code
tools: ["Read", "Write", "Edit", "MultiEdit", "Bash"]
color: blue
---
[System prompt content]
```

## Key Design Principles

1. **Model-Native Approach**: No hardcoded triggers, natural agent selection
2. **Dynamic Configuration**: All agent properties loaded at runtime
3. **Priority Hierarchy**: Project > User > Built-in configurations
4. **Hot Reload**: File watchers for immediate updates
5. **Backward Compatibility**: Default to general-purpose when not specified

## Integration Points

### With Existing Systems:
- ModelManager for model resolution
- Permission system for tool access
- Theme system for UI colors
- Message system for display
- Tool registry for available tools

### New Dependencies:
- `gray-matter`: YAML frontmatter parsing
- File system watchers for hot reload
- Memoization for performance

## Performance Considerations

1. **Caching**: Memoized agent loading functions
2. **Lazy Loading**: Agents loaded on-demand
3. **File Watchers**: Efficient change detection
4. **Async Operations**: Non-blocking configuration loading

## Testing Coverage

- Agent loading from multiple directories
- Priority override system
- Tool filtering
- Dynamic UI updates
- Error handling for missing agents
- Cache invalidation

## Migration Path

1. Existing Task tool calls continue to work (default to general-purpose)
2. New subagent_type parameter is optional
3. Gradual adoption of agent configurations
4. No breaking changes to existing workflows

## Future Enhancements

1. Agent templates for common use cases
2. Agent composition (agents using other agents)
3. Performance metrics per agent
4. Agent-specific settings UI
5. Export/import agent configurations