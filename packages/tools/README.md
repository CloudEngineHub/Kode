# Built-in tools

`src/registry.ts` is the canonical tool registry. Implementations live under
`src/tools/<domain>/<ToolName>/` and own schemas, prompts, permission behavior,
and execution.

Tools should return serializable outcomes so CLI, print mode, ACP, MCP, and Web
hosts can present them consistently. Existing React/Ink rendering inside this
package is compatibility debt and should move toward host-owned presenters as
interfaces are stabilized.
