# Kode - AI Coding

<img width="991" height="479" alt="image" src="https://github.com/user-attachments/assets/c1751e92-94dc-4e4a-9558-8cd2d058c1a1" />

<a href="https://trendshift.io/repositories/22005" target="_blank"><img src="https://trendshift.io/api/badge/repositories/22005" alt="shareAI-lab%2FKode-Agent | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>
[![npm version](https://badge.fury.io/js/@shareai-lab%2Fkode.svg)](https://www.npmjs.com/package/@shareai-lab/kode)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![AGENTS.md](https://img.shields.io/badge/AGENTS.md-Compatible-brightgreen)](https://agents.md)

[English](README.md) | [贡献指南](CONTRIBUTING.md) | [文档](docs/README.md)

## 概述

Kode 是一个强大的终端 AI 助手。它能理解你的代码库、编辑文件、运行命令，并为你处理整个开发工作流。

> **⚠️ 安全提示**：Kode 默认以 YOLO 模式运行（等同于 `--dangerously-skip-permissions`），跳过所有权限检查。处理重要项目时请使用 `kode --safe` 启用权限检查。

## 功能特性

- 🤖 **AI 驱动的助手** - 使用先进的 AI 模型理解并响应你的请求
- 🔄 **多模型协同** - 灵活切换和组合多个 AI 模型（Option+M 快速切换）
- 🦜 **专家模型咨询** - 使用 `@ask-model-name` 咨询特定模型的专业分析
- 👤 **智能代理系统** - 使用 `@run-agent-name` 将任务委派给子代理
- 📝 **代码编辑** - 直接编辑文件，提供智能建议
- 🔍 **代码库理解** - 分析项目结构和代码关系
- 🚀 **命令执行** - 实时运行 shell 命令
- 🛠️ **工作流自动化** - 用简单的提示处理复杂任务
- 🎨 **交互式界面** - 美观的终端界面，支持语法高亮
- 🔌 **可扩展工具** - MCP 服务器、技能和插件

## 安装

```bash
npm install -g @shareai-lab/kode
```

> **🇨🇳 国内用户**：`npm install -g @shareai-lab/kode --registry=https://registry.npmmirror.com`

开发版：`npm install -g @shareai-lab/kode@dev`

命令：`kode`（主命令）| `kwa`（备选）| `kd`（别名）

### 原生二进制（Windows 开箱即用）

无需 WSL/Git Bash。Kode 在 `postinstall` 时下载原生二进制，不可用时回退到 Node.js。

覆盖：`KODE_BINARY_BASE_URL`（镜像）| `KODE_SKIP_BINARY_DOWNLOAD=1`（跳过）

## 快速开始

```bash
# 交互模式
kode

# 非交互模式
kode -p "解释这个函数" 路径/到/文件.js

# ACP 模式（用于 Toad/Zed）
kode-acp
```

### 配置

- 全局配置：`~/.kode.json`
- 项目设置：`./.kode/settings.json`
- 模型：`/model`（UI）或 `kode models import/export`（YAML）

### 斜杠命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示可用命令 |
| `/model` | 更改 AI 模型设置 |
| `/config` | 打开配置面板 |
| `/agents` | 管理子代理 |
| `/cost` | 显示 token 使用量和成本 |
| `/clear` | 清除对话历史 |
| `/plugin` | 管理插件/技能 |

## 多模型协同

Kode 支持**真正的多模型协同工作** - 为不同任务使用不同模型：

- **模型指针**：通过 `/model` 配置 `main`、`task`、`compact`、`quick` 模型
- **YAML 配置**：使用 `kode models export/import` 导出/导入团队可分享配置
- **专家咨询**：使用 `@ask-model-name` 咨询特定模型
- **并行处理**：使用 `@run-agent-name` 启动多个子代理

```bash
# 导出模型配置
kode models export --output kode-models.yaml

# 导入
kode models import kode-models.yaml
```

## 代理与技能

### 代理

在 `.kode/agents/` 创建代理模板：

```md
---
name: reviewer
description: "审查 diff 的正确性和安全性"
tools: ["Read", "Grep"]
model: inherit
---
严格。指出 bug 和有风险的变更。
```

运行：`@run-agent-reviewer ...` 或 `Task(subagent_type: "reviewer", ...)`

### 技能

从任意仓库安装技能：

```bash
npx add-skill vercel-labs/agent-skills -a kode
```

管理：`/plugin marketplace add`、`/plugin install`

## 开发

需要 [Bun](https://bun.sh)：

```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash  # macOS/Linux
powershell -c "irm bun.sh/install.ps1 | iex"  # Windows

# 设置
git clone https://github.com/shareAI-lab/kode.git
cd kode
bun install

# 开发
bun run dev

# 构建
bun run build

# 测试
bun test
```

## 贡献

欢迎贡献！请查看[贡献指南](CONTRIBUTING.md)。

## 许可证

Apache 2.0 - 详见 [LICENSE](LICENSE)。

## 支持

- 📚 [文档](docs/)
- 🐛 [报告问题](https://github.com/shareAI-lab/kode/issues)
- 💬 [讨论](https://github.com/shareAI-lab/kode/discussions)

## Star History

<a href="https://star-history.com/#shareAI-lab/kode&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=shareAI-lab/kode&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=shareAI-lab/kode&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=shareAI-lab/kode&type=Date" />
 </picture>
</a>