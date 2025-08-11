# Kode - 终端 AI 助手

[![npm version](https://badge.fury.io/js/@shareai-lab%2Fkode.svg)](https://www.npmjs.com/package/@shareai-lab/kode)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

[English](README.md) | [贡献指南](CONTRIBUTING.md) | [文档](docs/)

Kode 是一个强大的 AI 助手，运行在你的终端中。它能理解你的代码库、编辑文件、运行命令，并为你处理整个开发工作流。

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

## 安装

```bash
npm install -g @shareai-lab/kode
```

安装后，你可以使用以下任一命令：
- `kode` - 主命令
- `kwa` - Kode With Agent（备选）
- `kd` - 超短别名

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
kode -p "解释这个函数" main.js
# 或
kwa -p "解释这个函数" main.js
```

### 常用命令

- `/help` - 显示可用命令
- `/model` - 更改 AI 模型设置
- `/config` - 打开配置面板
- `/cost` - 显示 token 使用量和成本
- `/clear` - 清除对话历史
- `/init` - 初始化项目上下文

## 多模型智能协同

与 CC 仅支持单一模型不同，Kode 实现了**真正的多模型协同工作**，让你能够充分发挥不同 AI 模型的独特优势。

### 🏗️ 核心技术架构

#### 1. **ModelManager 多模型管理器**
我们设计了统一的 `ModelManager` 系统，支持：
- **模型配置文件（Model Profiles）**：每个模型都有独立的配置文件，包含 API 端点、认证信息、上下文窗口大小、成本等参数
- **模型指针（Model Pointers）**：用户可以在 `/model` 命令中配置不同用途的默认模型：
  - `main`：主 Agent 的默认模型
  - `task`：SubAgent 的默认模型
  - `reasoning`：预留给未来 ThinkTool 使用
  - `quick`：用于简单 NLP 任务（如安全性识别、生成标题描述等）的快速模型
- **动态模型切换**：支持运行时切换模型，无需重启会话，保持上下文连续性

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
- **Tab 键快速切换**：在输入框按 Tab 键即可快速切换当前对话使用的模型
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
  "modelProfiles": {
    "o3": { "provider": "openai", "model": "o3", "apiKey": "..." },
    "claude4": { "provider": "anthropic", "model": "claude-sonnet-4", "apiKey": "..." },
    "qwen": { "provider": "alibaba", "model": "qwen-coder", "apiKey": "..." }
  },
  "modelPointers": {
    "main": "claude4",      // 主对话模型
    "task": "qwen",         // 任务执行模型
    "reasoning": "o3",      // 推理模型
    "quick": "glm-4.5"      // 快速响应模型
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

### 📊 与官方实现的对比

| 特性 | Kode | 官方 CC |
|------|------|---------|
| 支持模型数量 | 无限制，可配置任意模型 | 仅支持单一 Claude 模型 |
| 模型切换 | ✅ Tab 键快速切换 | ❌ 需要重启会话 |
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

ISC 许可证 - 详见 [LICENSE](LICENSE)。

## 支持

- 📚 [文档](docs/)
- 🐛 [报告问题](https://github.com/shareAI-lab/kode/issues)
- 💬 [讨论](https://github.com/shareAI-lab/kode/discussions)