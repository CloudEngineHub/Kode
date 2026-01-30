# 配置系统

Kode 使用两层互补的配置体系：

1. **全局配置**（全局生效）：模型 profiles / 模型指针、主题、统计等
2. **settings 文件**（用户/项目/本地）：`.kode/settings.json`、`.kode/settings.local.json` 等（并兼容读取 legacy 的 `.claude`）

本文重点说明文件位置与**模型配置**的正确方式。

## 文件位置

### 全局配置（primary）

- 默认：`~/.kode.json`
- 如果设置了 `KODE_CONFIG_DIR`：`<KODE_CONFIG_DIR>/config.json`

Kode 还会使用一个数据目录存放日志/任务/记忆等：

- 默认：`~/.kode/`
- 如果设置了 `KODE_CONFIG_DIR`：`<KODE_CONFIG_DIR>/`

legacy 兼容：

- `CLAUDE_CONFIG_DIR` 仅影响 legacy 读取兼容根目录（例如 `~/.claude`），不会改变 Kode 的 primary 配置/数据目录。

### 项目 / 本地 settings（每个仓库）

- 项目 settings：`./.kode/settings.json`（legacy：`./.claude/settings.json`）
- 本地 settings：`./.kode/settings.local.json`（legacy：`./.claude/settings.local.json`）

例如：`/output-style` 会把选择写到 `settings.local.json` 的 `outputStyle`。

## 模型

### Model Profiles + Model Pointers（存储在全局配置里）

模型配置在全局配置中：

- `modelProfiles`：模型配置数组（provider / endpoint / key / 上下文等）
- `modelPointers`：默认指针 `main / task / compact / quick`

最小示例（仅示意）：

```json
{
  "modelProfiles": [
    {
      "name": "o3",
      "provider": "openai",
      "modelName": "o3",
      "baseURL": "https://api.openai.com/v1",
      "apiKey": "<YOUR_API_KEY>",
      "maxTokens": 8192,
      "contextLength": 200000,
      "isActive": true,
      "createdAt": 1710000000000
    }
  ],
  "modelPointers": {
    "main": "o3",
    "task": "o3",
    "compact": "o3",
    "quick": "o3"
  }
}
```

推荐的配置方式：

- 交互 UI：`/model`
- 团队可共享 YAML：`kode models export` / `kode models import`
- 查看当前配置（profiles/pointers）：`kode models list`

### YAML 导入/导出（团队共享）

```bash
kode models export --output kode-models.yaml
kode models import kode-models.yaml
kode models import --replace kode-models.yaml
```

导出的 YAML 默认会使用 `apiKey: { fromEnv: ... }`，建议把 key 放到环境变量里。

### Model selector（`model:` 字段应该怎么写）

在 Kode 的各类 `model:` 字段里（agents、Task tool 覆盖等），通常可以用：

- 指针：`main | task | compact | quick`
- Profile 名称：`OpenAI Main`
- ModelName：`o3`、`gpt-4o`、`qwen2.5-coder-32b-instruct`
- Provider 限定：`provider:modelName`（或 `provider:profileName`），例如 `openai:o3`

用 `kode models list` 可以快速查看当前可用的配置。

## `kode config` CLI（仅限少量 key）

`kode config` 主要用于少量“安全”的开关项（主题、verbose、少数项目开关等）。

```bash
# 全局 config keys
kode config get -g theme
kode config set -g theme dark
kode config list -g

# 项目级 keys（实际存储在全局配置的 projects[...] 下）
kode config get enableArchitectTool
kode config set enableArchitectTool true
kode config list
```

模型请优先使用 `/model` 或 `kode models import/export`（不建议用 `kode config set`）。

## 环境变量

### 核心变量

> 注意：Anthropic 的环境变量覆盖已禁用，请在 Kode 设置或模型配置中填写密钥。

```bash
# API 密钥
OPENAI_API_KEY=sk-...

# 模型选择
CLAUDE_MODEL=claude-3-5-sonnet-20241022
DEFAULT_MODEL_PROFILE=fast

# 功能标志
ENABLE_ARCHITECT_TOOL=true
DEBUG_MODE=true
VERBOSE=true

# MCP 配置
MCP_SERVER_URL=http://localhost:3000
MCP_TIMEOUT=30000

# 开发
NODE_ENV=development
LOG_LEVEL=debug
```

### 优先级规则

环境变量覆盖配置文件（Anthropic 密钥除外）：

1. 检查环境变量
2. 检查项目配置
3. 检查全局配置
4. 使用默认值

## 配置迁移

### 版本迁移

系统自动迁移旧配置格式：

```typescript
function migrateConfig(config: any): Config {
  // v1 到 v2：重命名字段
  if (config.iterm2KeyBindingInstalled) {
    config.shiftEnterKeyBindingInstalled = config.iterm2KeyBindingInstalled
    delete config.iterm2KeyBindingInstalled
  }

  // v2 到 v3：更新模型格式
  if (typeof config.model === 'string') {
    config.modelProfiles = {
      default: {
        type: 'anthropic',
        model: config.model,
      },
    }
    delete config.model
  }

  return config
}
```

### 备份和恢复

配置文件在更改前备份：

```typescript
function saveConfigWithBackup(config: Config) {
  // 创建备份
  const backupPath = `${configPath}.backup`
  fs.copyFileSync(configPath, backupPath)

  try {
    // 保存新配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
  } catch (error) {
    // 错误时从备份恢复
    fs.copyFileSync(backupPath, configPath)
    throw error
  }
}
```

## 配置验证

### 模式验证

使用 Zod 进行运行时验证：

```typescript
const ConfigSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  modelProfiles: z.record(ModelProfileSchema).optional(),
  modelPointers: ModelPointersSchema.optional(),
  mcpServers: z.record(MCPServerConfigSchema).optional(),
  // ... 其他字段
})

function loadConfig(path: string): Config {
  const raw = JSON.parse(fs.readFileSync(path, 'utf-8'))
  return ConfigSchema.parse(raw)
}
```

### 验证规则

1. **API 密钥**：必须匹配预期格式
2. **模型名称**：必须是有效的模型标识符
3. **URL**：必须是端点的有效 URL
4. **路径**：必须是有效的文件系统路径
5. **命令**：不得包含危险模式

## 配置范围

### 全局范围

影响所有项目：

- 用户偏好（主题、键绑定）
- 模型配置文件和 API 密钥
- 全局 MCP 服务器
- 自动更新程序设置

### 项目范围

特定于当前项目：

- 工具权限
- 允许的命令
- 项目上下文
- 本地 MCP 服务器
- 成本跟踪

### 会话范围

当前会话的临时：

- 运行时标志
- 临时权限
- 活动 MCP 连接
- 当前模型选择

## 高级配置

### 自定义模型提供商

```json
{
  "modelProfiles": {
    "custom-llm": {
      "type": "custom",
      "name": "我的自定义 LLM",
      "config": {
        "baseURL": "https://my-llm-api.com",
        "apiKey": "custom-key",
        "model": "my-model-v1",
        "headers": {
          "X-Custom-Header": "value"
        }
      }
    }
  }
}
```

### MCP 服务器示例

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {
        "ALLOWED_DIRECTORIES": "/home/user/projects"
      }
    },
    "github": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "web-api": {
      "type": "sse",
      "url": "https://api.example.com/mcp"
    }
  }
}
```

### 上下文配置

```json
{
  "context": {
    "projectType": "typescript",
    "framework": "react",
    "testingFramework": "jest",
    "buildTool": "webpack",
    "customContext": "该项目使用自定义状态管理解决方案..."
  }
}
```

## 配置最佳实践

### 1. 安全性

- 永远不要将 API 密钥提交到版本控制
- 使用环境变量存储机密
- 验证所有配置输入
- 适当限制命令权限

### 2. 组织

- 为用户偏好保留全局配置
- 为项目特定设置使用项目配置
- 在 README 中记录自定义配置
- 版本控制项目配置

### 3. 性能

- 在内存中缓存配置
- 仅在文件更改时重新加载
- 使用高效的 JSON 解析
- 最小化配置文件大小

### 4. 调试

- 为配置问题使用详细模式
- 使用 `config list` 检查配置
- 加载时验证配置
- 清楚地记录配置错误

## 故障排除

### 常见问题

1. **配置未加载**
   - 检查文件权限
   - 验证 JSON 语法
   - 确保正确的文件路径

2. **设置未应用**
   - 检查配置层次结构
   - 验证环境变量
   - 清除配置缓存

3. **迁移失败**
   - 从备份恢复
   - 手动更新格式
   - 检查迁移日志

### 调试命令

```bash
# 显示配置
kode config list

# 重置为默认值
kode config reset

# 显示配置路径
kode config paths
```

配置系统提供灵活、安全和强大的所有 Kode 设置管理，同时保持向后兼容性和用户友好的默认值。
