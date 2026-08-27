# Developer documentation

Start with the repository-level [architecture](../architecture.md) and
[project structure](../PROJECT_STRUCTURE.md). The documents here describe
specific maintained interfaces:

- [Configuration](configuration.md)
- [Security model](security-model.md)
- [Testing](testing.md)
- [Releasing](releasing.md)
- [Tool system](tools-system.md)
- [Context system](modules/context-system.md)
- [Custom commands](modules/custom-commands.md)
- [MCP integration](modules/mcp-integration.md)
- [Model management](modules/model-management.md)
- [OpenAI adapters](modules/openai-adapters.md)
- [Query engine](modules/query-engine.md)
- [REPL interface](modules/repl-interface.md)

Development uses Bun 1.3.6 and the committed `bun.lock`:

```bash
bun install --frozen-lockfile
bun run format:check
bun run typecheck
bun test
bun run build
```
