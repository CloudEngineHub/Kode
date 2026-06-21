# LSP (Language Server Protocol)

Kode includes an `LSP` tool that can query Language Server Protocol servers for code-intelligence operations:

- `goToDefinition`, `findReferences`, `hover`
- `documentSymbol`, `workspaceSymbol`
- `goToImplementation`
- `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`

The `LSP` tool is enabled only when at least one configured LSP server is available and not in an error state.

Use the `/lsp` command to inspect the resolved LSP server list and language mappings.

## Agent-guided setup

Kode is designed so you can manage Kode’s own capabilities via the agent. For LSP, start here:

- Run `/lsp` to inspect what’s runnable right now
- Run `/capabilities lsp` (or describe your goal in chat) to let the agent manage LSP via plugins (no “install menu” workflow).

## IDE MCP vs built-in LSP

- If you have an IDE MCP server connected, Kode can still use the built-in `LSP` tool when you’ve configured LSP servers.
- If you don’t configure any LSP servers, the `LSP` tool stays disabled and the agent may rely on MCP-provided tools instead.
- The `/lsp` screen shows whether an MCP client named `ide` is currently connected.

## Configure LSP servers

Kode loads LSP server configuration from **enabled plugins**:

- Plugin root: `.lsp.json` (standard JSON)
- Plugin manifest: `lspServers` (relative path to a JSON file within the plugin, or an inline record)

## Server config schema

Each entry is an object:

- `command` (string): executable to run (no spaces unless it’s an absolute path)
- `args` (string[], optional): CLI arguments
- `extensionToLanguage` (object): file extension → LSP `languageId` (keys must start with `.`)
- `transport` (`"stdio"` | `"socket"`, optional): only `stdio` is supported (socket is ignored)
- `env` (object, optional): extra environment variables for the server process
- `initializationOptions` (any, optional): passed to `initialize`
- `settings` (any, optional): currently not applied by Kode
- `workspaceFolder` (string, optional): workspace root used for `rootUri`
- `startupTimeout`, `shutdownTimeout` (number, optional, milliseconds): not supported
- `restartOnCrash` (boolean, optional): not supported
- `maxRestarts` (number, optional)

## Example: TypeScript / JavaScript

Example `.lsp.json` (inside a plugin root):

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact"
    }
  }
}
```

## Plugin templates

When configuring LSP servers inside plugins, string fields support:

- `${CLAUDE_PLUGIN_ROOT}`
- `${VAR:-default}` for environment variable defaults

## Bundled skills (runtime)

Kode ships a small set of bundled skills under `packages/builtin-skills/skills/**` that are discoverable by the Skill system at runtime (see `apps/cli/src/services/customCommands/loader.ts`).
