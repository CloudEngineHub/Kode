# Kode - AI Coding

<img width="991" height="479" alt="image" src="https://github.com/user-attachments/assets/c1751e92-94dc-4e4a-9558-8cd2d058c1a1" />

<a href="https://trendshift.io/repositories/22005" target="_blank"><img src="https://trendshift.io/api/badge/repositories/22005" alt="shareAI-lab%2FKode-Agent | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
[![npm version](https://badge.fury.io/js/@shareai-lab%2Fkode.svg)](https://www.npmjs.com/package/@shareai-lab/kode)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![AGENTS.md](https://img.shields.io/badge/AGENTS.md-Compatible-brightgreen)](https://agents.md)

[中文文档](README.zh-CN.md) | [Contributing](CONTRIBUTING.md) | [Documentation](docs/README.md)

## Overview

Kode is a powerful AI assistant that lives in your terminal. It can understand your codebase, edit files, run commands, and handle entire workflows for you.

> **⚠️ Security Notice**: Kode runs in YOLO mode by default (equivalent to `--dangerously-skip-permissions`), bypassing all permission checks. Use `kode --safe` to enable permission checks for important projects.

## Features

- 🤖 **AI-Powered Assistance** - Advanced AI models to understand and respond to your requests
- 🔄 **Multi-Model Collaboration** - Switch and combine multiple AI models (Option+M to cycle)
- 🦜 **Expert Model Consultation** - Use `@ask-model-name` for specialized analysis
- 👤 **Intelligent Agent System** - Use `@run-agent-name` to delegate tasks to subagents
- 📝 **Code Editing** - Direct file editing with intelligent suggestions
- 🔍 **Codebase Understanding** - Analyzes project structure and code relationships
- 🚀 **Command Execution** - Run shell commands in real-time
- 🛠️ **Workflow Automation** - Handle complex tasks with simple prompts
- 🎨 **Interactive UI** - Beautiful terminal interface with syntax highlighting
- 🔌 **Extensible Tools** - MCP servers, skills, and plugins

## Installation

```bash
npm install -g @shareai-lab/kode
```

> **🇨🇳 China users**: `npm install -g @shareai-lab/kode --registry=https://registry.npmmirror.com`

Dev channel: `npm install -g @shareai-lab/kode@dev`

Commands: `kode` (primary) | `kwa` (alternative) | `kd` (alias)

### Native Binaries (Windows OOTB)

No WSL/Git Bash required. Kode downloads a native binary on `postinstall` and falls back to Node.js when needed.

Override: `KODE_BINARY_BASE_URL` (mirror) | `KODE_SKIP_BINARY_DOWNLOAD=1` (skip)

## Quick Start

```bash
# Interactive mode
kode

# Non-interactive mode
kode -p "explain this function" path/to/file.js

# ACP mode (for Toad/Zed)
kode-acp
```

### Configuration

- Global config: `~/.kode.json`
- Project settings: `./.kode/settings.json`
- Models: `/model` (UI) or `kode models import/export` (YAML)

### Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/model` | Change AI model settings |
| `/config` | Open configuration panel |
| `/agents` | Manage subagents |
| `/cost` | Show token usage and costs |
| `/clear` | Clear conversation history |
| `/plugin` | Manage plugins/skills |

## Multi-Model Collaboration

Kode supports **true multi-model collaboration** - use different models for different tasks:

- **Model Pointers**: Configure `main`, `task`, `compact`, `quick` models via `/model`
- **YAML Config**: Export/import team-shareable configs with `kode models export/import`
- **Expert Consultation**: Use `@ask-model-name` to consult specific models
- **Parallel Processing**: Launch multiple subagents with `@run-agent-name`

```bash
# Export model config
kode models export --output kode-models.yaml

# Import
kode models import kode-models.yaml
```

## Agents & Skills

### Agents

Create agent templates in `.kode/agents/`:

```md
---
name: reviewer
description: "Review diffs for correctness and security"
tools: ["Read", "Grep"]
model: inherit
---
Be strict. Point out bugs and risky changes.
```

Run: `@run-agent-reviewer ...` or `Task(subagent_type: "reviewer", ...)`

### Skills

Install skills from any repository:

```bash
npx add-skill vercel-labs/agent-skills -a kode
```

Manage: `/plugin marketplace add`, `/plugin install`

## Development

Requires [Bun](https://bun.sh):

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash  # macOS/Linux
powershell -c "irm bun.sh/install.ps1 | iex"  # Windows

# Setup
git clone https://github.com/shareAI-lab/kode.git
cd kode
bun install

# Development
bun run dev

# Build
bun run build

# Test
bun test
```

## Contributing

We welcome contributions! See [Contributing Guide](CONTRIBUTING.md).

## License

Apache 2.0 - see [LICENSE](LICENSE).

## Support

- 📚 [Documentation](docs/)
- 🐛 [Report Issues](https://github.com/shareAI-lab/kode/issues)
- 💬 [Discussions](https://github.com/shareAI-lab/kode/discussions)

## Star History

<a href="https://star-history.com/#shareAI-lab/kode&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=shareAI-lab/kode&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=shareAI-lab/kode&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=shareAI-lab/kode&type=Date" />
 </picture>
</a>