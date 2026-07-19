export const TOOL_NAME = 'ListMcpResourcesTool'

export const DESCRIPTION = `Lists available resources and resource templates from configured MCP servers.
Each resource object includes a 'server' field indicating which server it's from. Static resources use type "resource" with a "uri"; resource templates use type "resource_template" with a "uriTemplate".

Usage examples:
- List all resources from all servers: \`listMcpResources\`
- List resources from a specific server: \`listMcpResources({ server: "myserver" })\`
- List only static resources: \`listMcpResources({ includeTemplates: false })\``

export const PROMPT = `List available resources and resource templates from configured MCP servers.
Each returned resource will include all standard MCP resource fields plus a 'server' field 
indicating which server the resource belongs to. Static resources use type "resource" and can be read directly by URI. Resource templates use type "resource_template"; fill their uriTemplate placeholders before reading the concrete URI.

Parameters:
- server (optional): The name of a specific MCP server to get resources from. If not provided,
  resources from all servers will be returned.
- includeTemplates (optional, default true): Include MCP resource templates from resources/templates/list.`
