# Kode - 终端 AI 助手

[![npm version](https://badge.fury.io/js/@shareai-lab%2Fkode.svg)](https://www.npmjs.com/package/@shareai-lab/kode)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

[English](README.md) | [贡献指南](CONTRIBUTING.md) | [文档](docs/README.md)

## 🎉 重磅消息：我们已切换至 Apache 2.0 开源协议！

**开发者社区的福音来了！** 为了推动 AI 智能体技术的民主化进程，构建充满活力的创新生态，我们激动地宣布：Kode 已正式从 AGPLv3 协议升级为 **Apache 2.0 开源协议**。

### 这对您意味着什么：
- ✅ **完全自由**：在任何项目中使用 Kode - 无论是个人项目、商业产品还是企业方案
- ✅ **无障碍创新**：构建专有解决方案，无需开源您的代码
- ✅ **极简要求**：仅需保留版权声明和许可信息
- ✅ **共创未来**：与全球开发者一起，加速世界向 AI 驱动生产的转型

让我们携手共建未来！🚀

## 📢 更新日志

**2025-12-22**：npm + optionalDependencies 分发（全平台）。Kode 优先使用按平台拆分的原生二进制包（`@shareai-lab/kode-bin-*`），并在需要时回退到 Node.js 入口；同时会在 GitHub Releases 发布单文件二进制。详见 `docs/binary-distribution.md`。

## 🤝 AGENTS.md 标准支持

Kode 支持 [AGENTS.md 标准](https://agents.md)：一个简单、开放的“项目指令”格式，用于指导各类 coding agent，在 60k+ 开源项目中被使用。

### 指令文件发现规则（兼容 Codex）

- Kode 会从 Git 仓库根目录一路走到当前工作目录（`cwd`）读取项目指令。
- 每一层目录最多读取一个文件：优先 `AGENTS.override.md`，否则读取 `AGENTS.md`。
- 指令会按 root → leaf 拼接（默认合并上限 32KiB；可通过 `KODE_PROJECT_DOC_MAX_BYTES` 覆盖）。
- 如果当前目录存在 `CLAUDE.md`，Kode 也会将其作为 legacy 指令文件读取（兼容 legacy `.claude` 格式）。

Kode 是一个强大的 AI 助手，运行在你的终端中。它能理解你的代码库、编辑文件、运行命令，并为你处理整个开发工作流。

> **⚠️ 安全提示**：Kode 默认以 YOLO 模式运行（等同于 `--dangerously-skip-permissions` 标志），跳过所有权限检查以获得最大生产力。YOLO 模式仅建议在安全可信的环境中处理非重要项目时使用。如果您正在处理重要文件或使用能力存疑的模型，我们强烈建议使用 `kode --safe` 启用权限检查和手动审批所有操作。
> 
> **📊 模型性能建议**：为获得最佳体验，建议使用专为自主任务完成设计的新一代强大模型。避免使用 GPT-4o、Gemini 2.5 Pro 等较老的问答型模型，它们主要针对回答问题进行优化，而非持续的独立任务执行。请选择专门训练用于智能体工作流和扩展推理能力的模型。

## 网络与隐私

- 默认不发送产品遥测/分析数据。
- 仅在你显式使用相关能力时才会产生网络请求：
  - 模型提供商请求（你配置的 Anthropic/OpenAI-compatible 等端点）
  - Web 工具（`WebFetch`、`WebSearch`）
  - 插件市场下载（GitHub/URL 来源）与 OAuth 流程（使用时）
  - 可选的更新检查（需显式开启 `autoUpdaterStatus: enabled`）

## 功能特性

- 🤖 **AI 驱动的助手** - 使用先进的 AI 模型理解并响应你的请求
- 🔄 **多模型协同** - 灵活切换和组合使用多个 AI 模型，发挥各自优势
- 📝 **代码编辑** - 直接编辑文件，提供智能建议和改进
- 🔍 **代码库理解** - 分析项目结构和代码关系
- 🚀 **命令执行** - 实时运行 shell 命令并查看结果
- 🛠️ **工作流自动化** - 用简单的提示处理复杂的开发任务
- 🎨 **交互式界面** - 美观的终端界面，支持语法高亮
- 🔌 **工具系统** - 可扩展的架构，为不同任务提供专门的工具
- 💾 **上下文管理** - 智能的上下文处理，保持对话连续性

### 创作便捷
- `Option+G`（Alt+G）将消息打开到外部编辑器（优先 `$EDITOR`/`$VISUAL`，回退 code/nano/vim/notepad），关闭后内容自动回填到终端输入框。
- `Option+Enter` 在输入框内换行但不发送，普通 Enter 提交；`Option+M` 可快速切换模型。

## 安装

```bash
npm install -g @shareai-lab/kode
```

> **🇨🇳 中国用户提示**：如遇到网络问题，建议使用国内镜像源安装：
> ```bash
> npm install -g @shareai-lab/kode --registry=https://registry.npmmirror.com
> ```
>
> Kode 搜索默认使用 ripgrep（`rg`）。npm 发布包通过按平台拆分的 `optionalDependencies` 提供（`@shareai-lab/kode-ripgrep-<platform>-<arch>`）。如果你安装时禁用了 optionalDependencies（例如 `--no-optional`），请自行安装系统 `rg` 或设置 `KODE_RIPGREP_PATH`。
>
> Kode 也通过按平台拆分的 `optionalDependencies` 提供可选原生 CLI 二进制（`@shareai-lab/kode-bin-<platform>-<arch>`）。如果你安装时禁用了 optionalDependencies（`--no-optional`/`--omit=optional`），则会走 Node.js 入口（`dist/index.js`）。
>
> npm 安装过程不会从 GitHub 下载任何二进制文件。（可选的单文件二进制在 GitHub Releases，和 npm 安装是两套独立发布流程。）

开发版（最新特性）：

```bash
npm install -g @shareai-lab/kode@dev
```

安装后，你可以使用以下任一命令：
- `kode` - 主命令
- `kwa` - Kode With Agent（备选）
- `kd` - 超短别名

### 单文件二进制（可选）

如果你希望“绿色运行”（不通过 npm 安装），可以从 GitHub Releases 下载对应平台的 Bun 编译产物：

- https://github.com/shareAI-lab/kode/releases

详见 `docs/binary-distribution.md`（资产命名、本地构建）。

### 配置 / API Key

- 全局配置（模型 profiles / 指针、主题等）：默认在 `~/.kode.json`（如设置 `KODE_CONFIG_DIR` 则为 `<KODE_CONFIG_DIR>/config.json`）。
- 项目/本地 settings（如输出风格）：`./.kode/settings.json` 与 `./.kode/settings.local.json`（部分功能兼容 legacy `.claude`）。
- 模型推荐用 `/model`（交互 UI）或 `kode models import/export`（YAML）。详见 `docs/develop/configuration.md`。

## 使用方法

### 交互模式
启动交互式会话：
```bash
kode
# 或
kwa
# 或
kd
```

### 非交互模式
获取快速响应：
```bash
kode -p "解释这个函数" 路径/到/文件.js
# 或
kwa -p "解释这个函数" 路径/到/文件.js
```

### ACP（Agent Client Protocol）

以 ACP Agent Server（stdio JSON-RPC）模式运行 Kode，供 Toad / Zed 等 ACP Client 使用：

```bash
kode-acp
# 或
kode --acp
```

Toad 示例：

```bash
toad acp "kode-acp"
```

更多说明：`docs/acp.md`。

### Docker 使用说明
 
```bash
# 克隆仓库
git clone https://github.com/shareAI-lab/Kode.git
cd Kode

# 本地构建镜像
docker build --no-cache -t kode .

# 在你的项目目录中运行
cd your-project
docker run -it --rm \
  -v $(pwd):/workspace \
  -v ~/.kode:/root/.kode \
  -v ~/.kode.json:/root/.kode.json \
  -w /workspace \
  kode
```

#### Docker 配置详情

该 Docker 配置包含以下内容：

* **卷挂载（Volume Mounts）**：

  * `$(pwd):/workspace` - 挂载当前项目目录
  * `~/.kode:/root/.kode` - 在运行间保留 kode 配置目录
  * `~/.kode.json:/root/.kode.json` - 在运行间保留 kode 全局配置文件

* **工作目录**：容器内工作目录设置为 `/workspace`

* **交互模式**：使用 `-it` 标志以交互式终端方式运行

* **清理**：使用 `--rm` 在退出后自动删除容器

**注意**：
Kode 同时使用 `~/.kode` 目录（存放额外数据，如内存文件）和 `~/.kode.json` 文件（全局配置）。

第一次运行 Docker 命令时会构建镜像，之后的运行会使用缓存镜像以加快启动速度。

你可以通过引导流程（onboarding）来设置模型，或使用 `/model` 命令。
如果在列表中没有你想要的模型，可以在 `/config` 中手动设置。
只要你有一个 OpenAI 风格的 API 端点，就可以正常使用。


### 常用命令

- `/help` - 显示可用命令
- `/model` - 更改 AI 模型设置
- `/config` - 打开配置面板
- `/agents` - 管理 subagents
- `/output-style` - 设置输出风格
- `/statusline` - 配置自定义状态栏命令
- `/cost` - 显示 token 使用量和成本
- `/clear` - 清除对话历史
- `/init` - 初始化项目上下文
- `/plugin` - 管理插件/市场（技能、命令）

## Agents / Subagents

Kode 支持 subagents（agent 模版），用于任务委派与编排。

- Agents 会从 `.kode/agents` 与 `.claude/agents`（用户 + 项目）加载，并叠加 plugins/policy/`--agents`。
- 用 `/agents` 打开管理 UI（默认新建写入 `./.kode/agents` / `~/.kode/agents`；legacy `.claude/agents` 仅作为读取兼容）
- 用提及运行：`@run-agent-<agentType> ...`
- 用工具运行：`Task(subagent_type: "<agentType>", ...)`
- CLI flags：`--agents <json>`（本次运行注入 agents）、`--setting-sources user,project,local`（控制加载来源）

最小 agent 文件示例（`./.kode/agents/reviewer.md`）：

```md
---
name: reviewer
description: "Review diffs for correctness, security, and simplicity"
tools: ["Read", "Grep"]
model: inherit
---

更严格一些：指出 bug / 风险点，优先推荐小而聚焦的修改。
```

`model` 字段说明：
- 兼容别名：`inherit`、`opus`、`sonnet`、`haiku`（会映射到 model pointers）
- Kode 选择器（通过 `/model` 配置）：指针（`main|task|compact|quick`）、profile 名称、modelName，或 `provider:modelName`（例如 `openai:o3`）

校验 agent 模版：

```bash
kode agents validate
```

详见 `docs/agents-system.md`。

## 技能与插件

Kode 支持：
- **Agent Skills** 格式（`SKILL.md`）用于分发可复用技能包
- **Marketplace 兼容**（`.kode-plugin/marketplace.json`，legacy `.claude-plugin/marketplace.json`）用于分享/安装技能包

### 从 marketplace 安装技能

```bash
# 添加 marketplace（本地路径、GitHub owner/repo、或 URL）
kode plugin marketplace add ./path/to/marketplace-repo
kode plugin marketplace add owner/repo
kode plugin marketplace list

# 安装插件包（会安装 skills/commands）
kode plugin install document-skills@anthropic-agent-skills --scope user

# 项目范围安装（写入到当前项目的 ./.kode/...）
kode plugin install document-skills@anthropic-agent-skills --scope project

# 禁用/启用已安装插件
kode plugin disable document-skills@anthropic-agent-skills --scope user
kode plugin enable document-skills@anthropic-agent-skills --scope user
```

交互模式等价命令：

```text
/plugin marketplace add owner/repo
/plugin install document-skills@anthropic-agent-skills --scope user
```

### 使用技能

- 交互模式下可直接运行：`/pdf`、`/xlsx` 等
- Kode 也可在合适时机通过 `Skill` 工具自动调用技能

### 创建技能（Agent Skills）

创建 `./.kode/skills/<skill-name>/SKILL.md`（项目）或 `~/.kode/skills/<skill-name>/SKILL.md`（用户）：

```md
---
name: my-skill
description: 描述这个技能做什么、何时使用。
allowed-tools: Read Bash(git:*) Bash(jq:*)
---

# 技能说明
```

命名规则：
- `name` 必须与文件夹名一致
- 仅允许小写字母/数字/连字符，长度 1–64

兼容性：
- Kode 也会自动发现 `.claude/skills` 与 `.claude/commands`（legacy 兼容）。

### 分发技能

- Marketplace 仓库：在仓库根目录放置 `.kode-plugin/marketplace.json`，列出插件包与其 `skills` 目录（legacy `.claude-plugin/marketplace.json` 兼容）。
- Plugin 仓库：完整插件需在插件根目录包含 `.kode-plugin/plugin.json`，并确保路径均为相对路径（`./...`）。

详见 `docs/skills.md`。

### 输出风格

用输出风格切换 system prompt 行为。

- 选择：`/output-style`（菜单）或 `/output-style <style>`
- 内置：`default`、`Explanatory`、`Learning`
- 按项目存储在 `./.kode/settings.local.json` 的 `outputStyle`（legacy `.claude/settings.local.json` 兼容）
- 自定义风格：放在 `./.kode/output-styles/` 或 `~/.kode/output-styles/`（legacy `.claude/output-styles/` 兼容）
- 插件也可提供风格（`output-styles/` 或 manifest `outputStyles`）；插件风格命名为 `<plugin>:<style>`

详见 `docs/output-styles.md`。

## MCP 服务器（扩展）

Kode 可通过 MCP（Model Context Protocol）接入外部工具服务器，扩展工具与上下文能力。

- 配置文件：项目根目录 `.mcp.json`（推荐）或 `.mcprc`。详见 `docs/mcp.md`。
- CLI：

```bash
kode mcp add
kode mcp list
kode mcp get <name>
kode mcp remove <name>
```

示例 `.mcprc`：

```json
{
  "my-sse-server": { "type": "sse", "url": "http://127.0.0.1:3333/sse" }
}
```

## 权限与审批

- 默认模式为 YOLO（等同于 `--dangerously-skip-permissions`），为效率跳过多数确认。
- 安全模式：`kode --safe` 会对 Bash 命令、文件写入/编辑等高风险操作进行手动审批。
- 计划模式（Plan Mode）：助手可能请求进入计划模式先生成方案；计划模式下仅允许只读/规划类工具（以及写入计划文件），退出计划模式后才会执行改动。

## 粘贴与图片

- 大段/多行文本粘贴会以占位符形式插入，发送时自动展开。
- 粘贴多个已存在的文件路径会自动转换为 `@path` 引用（必要时自动加引号）。
- 图片粘贴（macOS）：按 `Ctrl+V` 可附加剪贴板图片；支持一次粘贴多张后再发送。

## 系统级 Sandbox（Linux）

- 在 `--safe` 下（或 `KODE_SYSTEM_SANDBOX=1`），agent 触发的 Bash tool 会优先尝试在 `bwrap` 沙箱中运行（best effort）。
- 默认禁用网络；可用 `KODE_SYSTEM_SANDBOX_NETWORK=inherit` 放开网络。
- 可用 `KODE_SYSTEM_SANDBOX=required` 在无法启动沙箱时直接失败（fail closed）。
- 详见 `docs/system-sandbox.md`（包含 macOS/Windows 建议方案与取舍）。

## 常见排障

- 模型：用 `/model`，或 `kode models import kode-models.yaml` 导入团队共享模型配置；确认所需 API Key 环境变量已设置。
- Windows：默认走 npm 安装即可；如需单文件可执行程序，请使用 GitHub Release 中对应平台的资产。
- MCP：用 `kode mcp list` 查看状态；若服务较慢可调 `MCP_CONNECTION_TIMEOUT_MS`、`MCP_SERVER_CONNECTION_BATCH_SIZE`、`MCP_TOOL_TIMEOUT`。
- Sandbox：Linux 安装 `bwrap`（bubblewrap），或设置 `KODE_SYSTEM_SANDBOX=0` 关闭。

## 多模型智能协同

与仅支持单一模型的终端助手不同，Kode 实现了**真正的多模型协同工作**，让你能够充分发挥不同 AI 模型的独特优势。

### 🏗️ 核心技术架构

#### 1. **ModelManager 多模型管理器**
我们设计了统一的 `ModelManager` 系统，支持：
- **模型配置文件（Model Profiles）**：每个模型都有独立的配置文件，包含 API 端点、认证信息、上下文窗口大小、成本等参数
- **模型指针（Model Pointers）**：用户可以在 `/model` 命令中配置不同用途的默认模型：
  - `main`：主 Agent 的默认模型
  - `task`：SubAgent 的默认模型
  - `compact`：用于接近上下文窗口上限时的自动压缩模型
  - `quick`：用于简单操作与工具调用的快速模型
- **动态模型切换**：支持运行时切换模型，无需重启会话，保持上下文连续性

#### 📦 可分享的模型配置（YAML）

你可以把模型配置（profiles + pointers）导出/导入为团队共享的 YAML 文件。默认导出不会包含明文 API Key（推荐用环境变量注入）。

```bash
# 导出到文件（也可以省略 --output 直接打印到 stdout）
kode models export --output kode-models.yaml

# 导入（默认 merge）
kode models import kode-models.yaml

# 用导入内容替换本地已有 profiles（不 merge）
kode models import --replace kode-models.yaml

# 列出当前 profiles + pointers
kode models list
```

示例 `kode-models.yaml`：

```yaml
version: 1
profiles:
  - name: OpenAI Main
    provider: openai
    modelName: gpt-4o
    maxTokens: 8192
    contextLength: 128000
    apiKey:
      fromEnv: OPENAI_API_KEY
pointers:
  main: gpt-4o
  task: gpt-4o
  compact: gpt-4o
  quick: gpt-4o
```

#### 2. **TaskTool 智能任务分发工具**
专门设计的 `TaskTool`（Architect 工具）实现了：
- **Subagent 机制**：可以启动多个子代理并行处理任务
- **模型参数传递**：用户可以在请求中指定 SubAgent 使用的模型
- **默认模型配置**：SubAgent 默认使用 `task` 指针配置的模型

#### 3. **AskExpertModel 专家咨询工具**
我们专门设计了 `AskExpertModel` 工具：
- **专家模型调用**：允许在对话中临时调用特定的专家模型解决疑难问题
- **模型隔离执行**：专家模型的响应独立处理，不影响主对话流程
- **知识整合**：将专家模型的见解整合到当前任务中

#### 🎯 灵活的模型切换
- **Option+M 快速切换**：在输入框按 Option+M 轮换主对话模型
- **`/model` 命令**：使用 `/model` 命令配置和管理多个模型配置文件，设置不同用途的默认模型
- **用户控制**：用户可以随时指定使用特定的模型进行任务处理

#### 🔄 智能的工作分配策略

**架构设计阶段**
- 使用 **o3 模型** 或 **GPT-5 模型** 探讨系统架构，制定犀利明确的技术方案
- 这些模型在抽象思维和系统设计方面表现卓越

**方案细化阶段**
- 使用 **gemini 模型** 深入探讨生产环境的设计细节
- 利用其在实际工程实践中的深厚积累和平衡的推理能力

**代码实现阶段**
- 使用 **Qwen Coder 模型**、**Kimi k2 模型** 、**GLM-4.5 模型** 或 **Claude Sonnet 4 模型** 进行具体的代码编写
- 这些模型在代码生成、文件编辑和工程实现方面性能强劲
- 支持通过 subagent 并行处理多个编码任务

**疑难问题解决**
- 遇到复杂问题时，可单独咨询 **o3 模型**、**Claude Opus 4.1 模型** 或 **Grok 4 模型** 等专家模型
- 获得深度的技术见解和创新的解决方案

#### 💡 实际应用场景

```bash
# 示例 1：架构设计
"用 o3 模型帮我设计一个高并发的消息队列系统架构"

# 示例 2：多模型协作
"先用 GPT-5 模型分析这个性能问题的根本原因，然后用 Claude Sonnet 4 模型编写优化代码"

# 示例 3：并行任务处理
"用 Qwen Coder 模型作为 subagent 同时重构这三个模块"

# 示例 4：专家咨询
"这个内存泄漏问题很棘手，单独问问 Claude Opus 4.1 模型有什么解决方案"

# 示例 5：代码审查
"让 Kimi k2 模型审查这个 PR 的代码质量"

# 示例 6：复杂推理
"用 Grok 4 模型帮我推导这个算法的时间复杂度"

# 示例 7：方案设计
"让 GLM-4.5 模型设计微服务拆分方案"
```

### 🛠️ 关键实现机制

#### **配置系统（Configuration System）**
```typescript
// 支持多模型配置的示例
{
  "modelProfiles": [
    { "name": "o3", "provider": "openai", "modelName": "o3", "apiKey": "...", "maxTokens": 1024, "contextLength": 128000, "isActive": true, "createdAt": 1710000000000 },
    { "name": "qwen", "provider": "alibaba", "modelName": "qwen-coder", "apiKey": "...", "maxTokens": 1024, "contextLength": 128000, "isActive": true, "createdAt": 1710000000001 }
  ],
  "modelPointers": {
    "main": "o3",           // 主对话模型
    "task": "qwen-coder",   // SubAgent 模型
    "compact": "o3",        // 压缩模型
    "quick": "o3"           // 快速操作模型
  }
}
```

#### **成本追踪系统（Cost Tracking）**
- **使用统计**：`/cost` 命令查看各模型的 token 使用量和花费
- **多模型成本对比**：实时追踪不同模型的使用成本
- **历史记录**：保存每个会话的成本数据

#### **上下文管理器（Context Manager）**
- **上下文继承**：切换模型时保持对话连续性
- **上下文窗口适配**：根据不同模型的上下文窗口大小自动调整
- **会话状态保持**：确保多模型协作时的信息一致性

### 🚀 多模型协同的优势

1. **效率最大化**：每个任务都由最适合的模型处理
2. **成本优化**：简单任务用轻量模型，复杂任务用强大模型
3. **并行处理**：多个模型可以同时处理不同的子任务
4. **灵活切换**：根据任务需求随时切换模型，无需重启会话
5. **取长补短**：结合不同模型的优势，获得最佳的整体效果

### 📊 与单模型 CLI 的对比

| 特性 | Kode | 单模型 CLI |
|------|------|---------|
| 支持模型数量 | 无限制，可配置任意模型 | 仅支持单一模型 |
| 模型切换 | ✅ Option+M 快速切换 | ❌ 需要重启会话 |
| 并行处理 | ✅ 多个 SubAgent 并行工作 | ❌ 单线程处理 |
| 成本追踪 | ✅ 多模型成本分别统计 | ❌ 单一模型成本 |
| 任务模型配置 | ✅ 不同用途配置不同默认模型 | ❌ 所有任务用同一模型 |
| 专家咨询 | ✅ AskExpertModel 工具 | ❌ 不支持 |

这种多模型协同能力让 Kode 成为真正的 **AI 开发工作台**，而不仅仅是一个单一的 AI 助手。

## 开发

Kode 使用现代化工具构建，开发需要 [Bun](https://bun.sh)。

### 安装 Bun

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"
```

### 设置开发环境

```bash
# 克隆仓库
git clone https://github.com/shareAI-lab/kode.git
cd kode

# 安装依赖
bun install

# 在开发模式下运行
bun run dev
```

### 构建

```bash
bun run build
```

### 测试

```bash
# 运行测试
bun test

# 测试 CLI
./cli.js --help
```

## 贡献

我们欢迎贡献！请查看我们的[贡献指南](CONTRIBUTING.md)了解详情。

## 许可证

Apache 2.0 许可证 - 详见 [LICENSE](LICENSE)。

## 支持

- 📚 [文档](docs/)
- 🐛 [报告问题](https://github.com/shareAI-lab/kode/issues)
- 💬 [讨论](https://github.com/shareAI-lab/kode/discussions)
