# MCP 配置与接入（.mcp.json / .mcprc）

Kode 支持通过 MCP（Model Context Protocol）接入外部工具服务器，并将 MCP server 下发的工具映射为动态工具名：`mcp__<server>__<tool>`。

## 1) 推荐：使用 `.mcp.json`（Claude Code 格式）

在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "my-stdio": {
      "type": "stdio",
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "env": {
        "FOO": "BAR"
      }
    },
    "my-http": {
      "type": "http",
      "url": "http://127.0.0.1:3333/mcp"
    },
    "my-sse-legacy": {
      "type": "sse",
      "url": "http://127.0.0.1:3333/sse"
    },
    "my-ws": {
      "type": "ws",
      "url": "ws://127.0.0.1:3333/mcp"
    }
  }
}
```

## 2) 兼容：使用 `.mcprc`（简化格式）

在项目根目录创建 `.mcprc`（一个 JSON 对象，key 为 server 名）：

```json
{
  "my-http": {
    "type": "http",
    "url": "http://127.0.0.1:3333/mcp"
  },
  "my-stdio": {
    "type": "stdio",
    "command": "node",
    "args": ["./server.js"]
  }
}
```

也兼容 `.mcprc` 包一层 `mcpServers`：

```json
{ "mcpServers": { "my-http": { "type": "http", "url": "http://127.0.0.1:3333/mcp" } } }
```

## 3) 审批与排障

- `.mcp.json` / `.mcprc` 属于“项目文件 MCP 配置”，首次启动会弹窗请求你批准这些 server；可用 `kode mcp reset-project-choices` 重置选择。
- 查看连接状态：交互模式输入 `/mcp`，或运行 `kode mcp`（slash command）/ `kode mcp list`（CLI 子命令）。
- 某些服务器启动较慢（例如 Python 实现）：可设置 `MCP_CONNECTION_TIMEOUT_MS=30000`（或更大）来放宽连接超时。

## 4) CLI 快速添加

- `kode mcp add <name> <url>`：默认按 `http`（Streamable HTTP）添加；如果是旧版 SSE transport，请使用 `kode mcp add-sse <name> <url>`。
- `kode mcp add <name> <command> [args...]`：添加 stdio server。
- `kode mcp get <name>` / `kode mcp remove <name>`：查看/删除。

