# Agent Configuration System

## Overview

Kode's Agent system allows you to create specialized AI agents with predefined configurations, tools, and prompts. This enables more efficient task execution by using purpose-built agents for specific types of work.

## Features

- **Dynamic Agent Loading**: Agents are loaded from configuration files at runtime
- **Five-tier Priority System**: Built-in < .claude (user) < .kode (user) < .claude (project) < .kode (project)
- **Hot Reload**: Configuration changes are detected and reloaded automatically
- **Tool Restrictions**: Limit agents to specific tools for security and focus
- **Model Selection**: Each agent can specify its preferred AI model
- **Interactive Management**: Use `/agents` command for graphical management

## Quick Start

### Using Pre-configured Agents

Kode comes with several built-in agents:

```bash
# Use the search specialist for finding files
kode "Find all TypeScript test files" --subagent-type search-specialist

# Use the code writer for implementations
kode "Implement a new user authentication feature" --subagent-type code-writer

# Use the reviewer for code analysis
kode "Review the changes in src/ for potential issues" --subagent-type reviewer

# Use the architect for design decisions
kode "Design a caching strategy for our API" --subagent-type architect
```

### Managing Agents

Use the `/agents` command in the Kode REPL to manage agents:

```bash
kode
> /agents
```

This opens an interactive UI where you can:
- View all available agents
- Create new agents
- Edit existing agents
- Delete custom agents

Keyboard shortcuts:
- `c` - Create new agent
- `r` - Reload agents
- `d` - Delete selected agent (when viewing)
- `q` or `Esc` - Exit

## Agent Configuration

### File Structure

Agents are defined as Markdown files with YAML frontmatter:

```markdown
---
name: agent-name
description: "When to use this agent"
tools: ["Tool1", "Tool2", "Tool3"]  # or "*" for all tools
model: model-name  # optional
---

System prompt content goes here...
```

### Configuration Locations

Agents can be defined at five levels with priority order (later overrides earlier):

1. **Built-in** (lowest priority)
   - Provided with Kode
   - Cannot be modified

2. **Claude User** (`~/.claude/agents/`)
   - Claude Code compatible user-level agents
   - Personal agents available across all projects

3. **Kode User** (`~/.kode/agents/`)
   - Kode-specific user-level agents
   - Overrides Claude user agents with same name
   - Create with `/agents` command or manually

4. **Claude Project** (`./.claude/agents/`)
   - Claude Code compatible project-specific agents
   - Overrides user-level agents

5. **Kode Project** (`./.kode/agents/`)
   - Kode-specific project agents
   - Highest priority, overrides all others

### Example: Creating a Custom Agent

#### 1. Manual Creation

Create a file `~/.kode/agents/api-designer.md`:

```markdown
---
name: api-designer
description: "Designs RESTful APIs and GraphQL schemas with best practices"
tools: ["FileRead", "FileWrite", "Grep"]
model: reasoning
---

You are an API design specialist. Your expertise includes:

- Designing RESTful APIs following OpenAPI specifications
- Creating GraphQL schemas with efficient resolvers
- Implementing proper authentication and authorization
- Ensuring API versioning and backward compatibility
- Writing comprehensive API documentation

Design principles:
- Follow REST best practices (proper HTTP verbs, status codes, etc.)
- Design for scalability and performance
- Include proper error handling and validation
- Consider rate limiting and caching strategies
- Maintain consistency across endpoints
```

#### 2. Using /agents Command

1. Run `kode` to start the REPL
2. Type `/agents`
3. Press `c` to create
4. Follow the prompts:
   - Enter agent name
   - Describe when to use it
   - Specify allowed tools
   - Optionally specify a model
   - Write the system prompt

## Advanced Usage

### Tool Restrictions

Limit agents to specific tools for focused operation:

```yaml
tools: ["FileRead", "Grep", "Glob"]  # Read-only agent
tools: ["FileWrite", "FileEdit"]     # Write-only agent
tools: ["*"]                         # All tools (default)
```

### Model Selection

Specify which AI model the agent should use:

```yaml
model: quick      # Fast responses for simple tasks
model: main       # Default model for general tasks
model: reasoning  # Complex analysis and design
```

### Combining with Direct Model Selection

You can override an agent's default model:

```bash
# Use reviewer agent but with a different model
kode "Review this code" --subagent-type reviewer --model gpt-4
```

## Available Built-in Agents

### general-purpose
- **Use for**: General research, complex multi-step tasks
- **Tools**: All tools
- **Model**: task (default)

### search-specialist
- **Use for**: Finding files, searching code patterns
- **Tools**: Grep, Glob, FileRead, LS
- **Model**: quick

### code-writer
- **Use for**: Writing and modifying code
- **Tools**: FileRead, FileWrite, FileEdit, MultiEdit, Bash
- **Model**: main

### reviewer
- **Use for**: Code review, quality analysis
- **Tools**: FileRead, Grep, Glob
- **Model**: reasoning

### architect
- **Use for**: System design, architecture decisions
- **Tools**: FileRead, FileWrite, Grep, Glob
- **Model**: reasoning

## Project-specific Agents

For project-specific agents, create them in `./.kode/agents/`:

```bash
mkdir -p .kode/agents
```

Example project agents included:

### test-writer
- **Use for**: Writing comprehensive test suites
- **Tools**: FileRead, FileWrite, FileEdit, Bash, Grep
- **Model**: main

### docs-writer
- **Use for**: Creating and updating documentation
- **Tools**: FileRead, FileWrite, FileEdit, Grep, Glob
- **Model**: main

## Best Practices

1. **Agent Naming**: Use descriptive, action-oriented names (e.g., `test-writer`, `api-designer`)

2. **Tool Selection**: Only include tools the agent actually needs

3. **System Prompts**: Be specific about the agent's role and guidelines

4. **Model Choice**: 
   - Use `quick` for simple, fast operations
   - Use `main` for general coding tasks
   - Use `reasoning` for complex analysis

5. **Organization**: 
   - Keep user agents for personal workflows
   - Keep project agents for team-shared configurations

## Troubleshooting

### Agents not loading?
- Check file permissions in `~/.kode/agents/` or `./.kode/agents/`
- Ensure YAML frontmatter is valid
- Use `/agents` command and press `r` to reload

### Agent not working as expected?
- Verify the tools list includes necessary tools
- Check the system prompt is clear and specific
- Test with verbose mode to see actual prompts

### Hot reload not working?
- File watcher requires proper file system events
- Try manual reload with `/agents` then `r`
- Restart Kode if needed

## Integration with Task Tool

The agent system is integrated with Kode's Task tool:

```typescript
// In your code or scripts
await TaskTool.call({
  description: "Search for patterns",
  prompt: "Find all instances of TODO comments",
  subagent_type: "search-specialist"
})
```

This allows programmatic use of agents in automation and scripts.

## Future Enhancements

Planned improvements:
- Agent templates and inheritance
- Performance metrics per agent
- Agent composition (agents using other agents)
- Cloud-based agent sharing
- Agent versioning and rollback