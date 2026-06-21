# MCP 配置与接入（.mcp.json / .mcprc）

Kode 支持通过 MCP（Model Context Protocol）接入外部工具服务器，并将 MCP server 下发的工具映射为动态工具名：`mcp__<server>__<tool>`。

## 1) 推荐：使用 `.mcp.json`（项目文件格式）

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
{
  "mcpServers": {
    "my-http": { "type": "http", "url": "http://127.0.0.1:3333/mcp" }
  }
}
```

## 3) 审批与排障

- `.mcp.json` / `.mcprc` 属于“项目文件 MCP 配置”，首次启动会弹窗请求你批准这些 server；可用 `kode mcp reset-project-choices` 重置选择。
- 查看连接状态：交互模式输入 `/mcp`，或运行 `kode mcp`（slash command）/ `kode mcp list`（CLI 子命令）。
- 连接超时（默认 `30000`ms）：`MCP_CONNECTION_TIMEOUT_MS=30000`；设置为 `0` 可关闭连接超时。
- 并发连接数量（默认 `3`，最大 `50`）：`MCP_SERVER_CONNECTION_BATCH_SIZE=3`（服务器较多或较慢时可调小）。
- 工具调用超时（默认不限制）：`MCP_TOOL_TIMEOUT=30000`（单位 ms，用于限制单次 MCP tool request 的耗时）。

## 4) CLI 快速添加

- `kode mcp add <name> <command> [args...]`：默认添加 `stdio` server；可用 `-e KEY=value` 设置环境变量；可用 `--scope local|user|project` 选择写入位置。
- `kode mcp add <name> <url> --transport http|sse`：显式指定 URL-based transport；可用 `-H "Header: value"` 设置请求头；也可使用 `kode mcp add-http` / `kode mcp add-sse`。
- `kode mcp remove <name>`：未指定 `--scope` 时会自动定位；若同名 server 同时存在于多个 scope，会提示你显式选择。
