# Kode系统 Responses API 支持重构施工文档

## 📋 项目概述

### 目标
将Kode系统从硬编码的GPT-5检测升级为基于能力声明的模型系统，支持所有Responses API类模型（GPT-5、GPT-6、GLM-5等）。

### 核心原则
1. **零破坏性**: 100%保留现有功能
2. **渐进式**: 可随时回滚
3. **可扩展**: 新模型只需配置
4. **优雅性**: 消除硬编码，统一处理流程

## 🏗️ 系统架构概览

### 当前架构（问题）
```
用户输入 → REPL → query.ts → queryLLM 
                                ↓
                         [硬编码检测]
                    if (isGPT5Model()) {...}
                    if (isGPT4Model()) {...}
                                ↓
                         不同的API调用路径
```

### 目标架构（解决方案）
```
用户输入 → REPL → query.ts → queryLLM
                                ↓
                         [能力声明系统]
                    ModelCapabilities查询
                                ↓
                         [统一适配器]
                    ResponsesAPIAdapter / ChatCompletionsAdapter
                                ↓
                         统一的API调用
```

## 📁 文件结构规划

```
src/
├── types/
│   └── modelCapabilities.ts      # 新建：能力类型定义
├── constants/
│   └── modelCapabilities.ts      # 新建：模型能力注册表
├── services/
│   ├── adapters/                 # 新建目录：适配器
│   │   ├── base.ts              # 新建：基础适配器类
│   │   ├── responsesAPI.ts      # 新建：Responses API适配器
│   │   └── chatCompletions.ts   # 新建：Chat Completions适配器
│   ├── modelAdapterFactory.ts   # 新建：适配器工厂
│   ├── claude.ts                 # 修改：使用新系统
│   └── openai.ts                 # 修改：清理硬编码
```

---

## 🚀 Phase 1: 基础设施建设（第1-2天）

### 目标
创建能力声明系统的基础架构，不影响现有代码运行。

### Step 1.1: 创建模型能力类型定义

**文件**: `src/types/modelCapabilities.ts` (新建)

**任务**: 定义模型能力接口

```typescript
// 完整代码 - 直接复制粘贴
export interface ModelCapabilities {
  // API架构类型
  apiArchitecture: {
    primary: 'chat_completions' | 'responses_api'
    fallback?: 'chat_completions'  // Responses API模型可降级
  }
  
  // 参数映射
  parameters: {
    maxTokensField: 'max_tokens' | 'max_completion_tokens'
    supportsReasoningEffort: boolean
    supportsVerbosity: boolean
    temperatureMode: 'flexible' | 'fixed_one' | 'restricted'
  }
  
  // 工具调用能力
  toolCalling: {
    mode: 'none' | 'function_calling' | 'custom_tools'
    supportsFreeform: boolean
    supportsAllowedTools: boolean
    supportsParallelCalls: boolean
  }
  
  // 状态管理
  stateManagement: {
    supportsResponseId: boolean
    supportsConversationChaining: boolean
    supportsPreviousResponseId: boolean
  }
  
  // 流式支持
  streaming: {
    supported: boolean
    includesUsage: boolean
  }
}

// 统一的请求参数
export interface UnifiedRequestParams {
  messages: any[]
  systemPrompt: string[]
  tools?: any[]
  maxTokens: number
  stream?: boolean
  previousResponseId?: string
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  verbosity?: 'low' | 'medium' | 'high'
  temperature?: number
}

// 统一的响应格式
export interface UnifiedResponse {
  id: string
  content: string
  toolCalls?: any[]
  usage: {
    promptTokens: number
    completionTokens: number
    reasoningTokens?: number
  }
  responseId?: string  // 用于Responses API状态管理
}
```

### Step 1.2: 创建模型能力注册表

**文件**: `src/constants/modelCapabilities.ts` (新建)

**任务**: 为所有模型定义能力

```typescript
import { ModelCapabilities } from '../types/modelCapabilities'

// GPT-5的标准能力定义
const GPT5_CAPABILITIES: ModelCapabilities = {
  apiArchitecture: {
    primary: 'responses_api',
    fallback: 'chat_completions'
  },
  parameters: {
    maxTokensField: 'max_completion_tokens',
    supportsReasoningEffort: true,
    supportsVerbosity: true,
    temperatureMode: 'fixed_one'
  },
  toolCalling: {
    mode: 'custom_tools',
    supportsFreeform: true,
    supportsAllowedTools: true,
    supportsParallelCalls: true
  },
  stateManagement: {
    supportsResponseId: true,
    supportsConversationChaining: true,
    supportsPreviousResponseId: true
  },
  streaming: {
    supported: false,  // Responses API暂不支持流式
    includesUsage: true
  }
}

// Chat Completions的标准能力定义
const CHAT_COMPLETIONS_CAPABILITIES: ModelCapabilities = {
  apiArchitecture: {
    primary: 'chat_completions'
  },
  parameters: {
    maxTokensField: 'max_tokens',
    supportsReasoningEffort: false,
    supportsVerbosity: false,
    temperatureMode: 'flexible'
  },
  toolCalling: {
    mode: 'function_calling',
    supportsFreeform: false,
    supportsAllowedTools: false,
    supportsParallelCalls: true
  },
  stateManagement: {
    supportsResponseId: false,
    supportsConversationChaining: false,
    supportsPreviousResponseId: false
  },
  streaming: {
    supported: true,
    includesUsage: true
  }
}

// 完整的模型能力映射表
export const MODEL_CAPABILITIES_REGISTRY: Record<string, ModelCapabilities> = {
  // GPT-5系列
  'gpt-5': GPT5_CAPABILITIES,
  'gpt-5-mini': GPT5_CAPABILITIES,
  'gpt-5-nano': GPT5_CAPABILITIES,
  'gpt-5-chat-latest': GPT5_CAPABILITIES,
  
  // GPT-4系列
  'gpt-4o': CHAT_COMPLETIONS_CAPABILITIES,
  'gpt-4o-mini': CHAT_COMPLETIONS_CAPABILITIES,
  'gpt-4-turbo': CHAT_COMPLETIONS_CAPABILITIES,
  'gpt-4': CHAT_COMPLETIONS_CAPABILITIES,
  
  // Claude系列（通过转换层支持）
  'claude-3-5-sonnet-20241022': CHAT_COMPLETIONS_CAPABILITIES,
  'claude-3-5-haiku-20241022': CHAT_COMPLETIONS_CAPABILITIES,
  'claude-3-opus-20240229': CHAT_COMPLETIONS_CAPABILITIES,
  
  // O1系列（特殊的推理模型）
  'o1': {
    ...CHAT_COMPLETIONS_CAPABILITIES,
    parameters: {
      ...CHAT_COMPLETIONS_CAPABILITIES.parameters,
      maxTokensField: 'max_completion_tokens',
      temperatureMode: 'fixed_one'
    }
  },
  'o1-mini': {
    ...CHAT_COMPLETIONS_CAPABILITIES,
    parameters: {
      ...CHAT_COMPLETIONS_CAPABILITIES.parameters,
      maxTokensField: 'max_completion_tokens',
      temperatureMode: 'fixed_one'
    }
  }
}

// 智能推断未注册模型的能力
export function inferModelCapabilities(modelName: string): ModelCapabilities | null {
  if (!modelName) return null
  
  const lowerName = modelName.toLowerCase()
  
  // GPT-5系列
  if (lowerName.includes('gpt-5') || lowerName.includes('gpt5')) {
    return GPT5_CAPABILITIES
  }
  
  // GPT-6系列（预留）
  if (lowerName.includes('gpt-6') || lowerName.includes('gpt6')) {
    return {
      ...GPT5_CAPABILITIES,
      streaming: { supported: true, includesUsage: true }
    }
  }
  
  // GLM系列
  if (lowerName.includes('glm-5') || lowerName.includes('glm5')) {
    return {
      ...GPT5_CAPABILITIES,
      toolCalling: {
        ...GPT5_CAPABILITIES.toolCalling,
        supportsAllowedTools: false  // GLM可能不支持
      }
    }
  }
  
  // O1系列
  if (lowerName.startsWith('o1') || lowerName.includes('o1-')) {
    return {
      ...CHAT_COMPLETIONS_CAPABILITIES,
      parameters: {
        ...CHAT_COMPLETIONS_CAPABILITIES.parameters,
        maxTokensField: 'max_completion_tokens',
        temperatureMode: 'fixed_one'
      }
    }
  }
  
  // 默认返回null，让系统使用默认行为
  return null
}

// 获取模型能力（带缓存）
const capabilityCache = new Map<string, ModelCapabilities>()

export function getModelCapabilities(modelName: string): ModelCapabilities {
  // 检查缓存
  if (capabilityCache.has(modelName)) {
    return capabilityCache.get(modelName)!
  }
  
  // 查找注册表
  if (MODEL_CAPABILITIES_REGISTRY[modelName]) {
    const capabilities = MODEL_CAPABILITIES_REGISTRY[modelName]
    capabilityCache.set(modelName, capabilities)
    return capabilities
  }
  
  // 尝试推断
  const inferred = inferModelCapabilities(modelName)
  if (inferred) {
    capabilityCache.set(modelName, inferred)
    return inferred
  }
  
  // 默认为Chat Completions
  const defaultCapabilities = CHAT_COMPLETIONS_CAPABILITIES
  capabilityCache.set(modelName, defaultCapabilities)
  return defaultCapabilities
}
```

### Step 1.3: 创建基础适配器类

**文件**: `src/services/adapters/base.ts` (新建)

**任务**: 创建adapters目录和基础类

```typescript
import { ModelCapabilities, UnifiedRequestParams, UnifiedResponse } from '../../types/modelCapabilities'
import { ModelProfile } from '../../utils/config'
import { Tool } from '../../Tool'

export abstract class ModelAPIAdapter {
  constructor(
    protected capabilities: ModelCapabilities,
    protected modelProfile: ModelProfile
  ) {}
  
  // 子类必须实现的方法
  abstract createRequest(params: UnifiedRequestParams): any
  abstract parseResponse(response: any): UnifiedResponse
  abstract buildTools(tools: Tool[]): any
  
  // 共享的工具方法
  protected getMaxTokensParam(): string {
    return this.capabilities.parameters.maxTokensField
  }
  
  protected getTemperature(): number {
    if (this.capabilities.parameters.temperatureMode === 'fixed_one') {
      return 1
    }
    if (this.capabilities.parameters.temperatureMode === 'restricted') {
      return Math.min(1, this.modelProfile.temperature || 0.7)
    }
    return this.modelProfile.temperature || 0.7
  }
  
  protected shouldIncludeReasoningEffort(): boolean {
    return this.capabilities.parameters.supportsReasoningEffort
  }
  
  protected shouldIncludeVerbosity(): boolean {
    return this.capabilities.parameters.supportsVerbosity
  }
}
```

### Step 1.4: 创建Responses API适配器

**文件**: `src/services/adapters/responsesAPI.ts` (新建)

**任务**: 实现Responses API适配器

```typescript
import { ModelAPIAdapter } from './base'
import { UnifiedRequestParams, UnifiedResponse } from '../../types/modelCapabilities'
import { Tool } from '../../Tool'
import { zodToJsonSchema } from '../../utils/zodToJsonSchema'

export class ResponsesAPIAdapter extends ModelAPIAdapter {
  createRequest(params: UnifiedRequestParams): any {
    const { messages, systemPrompt, tools, maxTokens } = params
    
    // 分离系统消息和用户消息
    const systemMessages = messages.filter(m => m.role === 'system')
    const nonSystemMessages = messages.filter(m => m.role !== 'system')
    
    // 构建基础请求
    const request: any = {
      model: this.modelProfile.modelName,
      input: this.convertMessagesToInput(nonSystemMessages),
      instructions: this.buildInstructions(systemPrompt, systemMessages)
    }
    
    // 添加token限制
    request[this.getMaxTokensParam()] = maxTokens
    
    // 添加温度（GPT-5只支持1）
    if (this.getTemperature() === 1) {
      request.temperature = 1
    }
    
    // 添加推理控制
    if (this.shouldIncludeReasoningEffort()) {
      request.reasoning = {
        effort: params.reasoningEffort || this.modelProfile.reasoningEffort || 'medium'
      }
    }
    
    // 添加详细度控制
    if (this.shouldIncludeVerbosity()) {
      request.text = {
        verbosity: params.verbosity || 'high'  // 编码任务默认高详细度
      }
    }
    
    // 添加工具
    if (tools && tools.length > 0) {
      request.tools = this.buildTools(tools)
      
      // 处理allowed_tools
      if (params.allowedTools && this.capabilities.toolCalling.supportsAllowedTools) {
        request.tool_choice = {
          type: 'allowed_tools',
          mode: 'auto',
          tools: params.allowedTools
        }
      }
    }
    
    // 添加状态管理
    if (params.previousResponseId && this.capabilities.stateManagement.supportsPreviousResponseId) {
      request.previous_response_id = params.previousResponseId
    }
    
    return request
  }
  
  buildTools(tools: Tool[]): any[] {
    // 如果不支持freeform，使用传统格式
    if (!this.capabilities.toolCalling.supportsFreeform) {
      return tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.inputJSONSchema || zodToJsonSchema(tool.inputSchema)
        }
      }))
    }
    
    // Custom tools格式（GPT-5特性）
    return tools.map(tool => {
      const hasSchema = tool.inputJSONSchema || tool.inputSchema
      const isCustom = !hasSchema || tool.freeformInput
      
      if (isCustom) {
        // Custom tool格式
        return {
          type: 'custom',
          name: tool.name,
          description: tool.description || ''
        }
      } else {
        // 传统function格式
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.inputJSONSchema || zodToJsonSchema(tool.inputSchema)
          }
        }
      }
    })
  }
  
  parseResponse(response: any): UnifiedResponse {
    // 处理基础文本输出
    let content = response.output_text || ''
    
    // 处理结构化输出
    if (response.output && Array.isArray(response.output)) {
      const messageItems = response.output.filter(item => item.type === 'message')
      if (messageItems.length > 0) {
        content = messageItems
          .map(item => {
            if (item.content && Array.isArray(item.content)) {
              return item.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join('\n')
            }
            return item.content || ''
          })
          .filter(Boolean)
          .join('\n\n')
      }
    }
    
    // 解析工具调用
    const toolCalls = this.parseToolCalls(response)
    
    // 构建统一响应
    return {
      id: response.id || `resp_${Date.now()}`,
      content,
      toolCalls,
      usage: {
        promptTokens: response.usage?.input_tokens || 0,
        completionTokens: response.usage?.output_tokens || 0,
        reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens
      },
      responseId: response.id  // 保存用于状态管理
    }
  }
  
  private convertMessagesToInput(messages: any[]): any {
    // 将消息转换为Responses API的input格式
    // 可能需要根据实际API规范调整
    return messages
  }
  
  private buildInstructions(systemPrompt: string[], systemMessages: any[]): string {
    const systemContent = systemMessages.map(m => m.content).join('\n\n')
    const promptContent = systemPrompt.join('\n\n')
    return [systemContent, promptContent].filter(Boolean).join('\n\n')
  }
  
  private parseToolCalls(response: any): any[] {
    if (!response.output || !Array.isArray(response.output)) {
      return []
    }
    
    return response.output
      .filter(item => item.type === 'tool_call')
      .map(item => ({
        id: item.id || `tool_${Date.now()}`,
        type: 'tool_call',
        name: item.name,
        arguments: item.arguments  // 可能是文本或JSON
      }))
  }
}
```

### Step 1.5: 创建Chat Completions适配器

**文件**: `src/services/adapters/chatCompletions.ts` (新建)

**任务**: 实现Chat Completions适配器

```typescript
import { ModelAPIAdapter } from './base'
import { UnifiedRequestParams, UnifiedResponse } from '../../types/modelCapabilities'
import { Tool } from '../../Tool'
import { zodToJsonSchema } from '../../utils/zodToJsonSchema'

export class ChatCompletionsAdapter extends ModelAPIAdapter {
  createRequest(params: UnifiedRequestParams): any {
    const { messages, systemPrompt, tools, maxTokens, stream } = params
    
    // 构建完整消息列表（包含系统提示）
    const fullMessages = this.buildMessages(systemPrompt, messages)
    
    // 构建请求
    const request: any = {
      model: this.modelProfile.modelName,
      messages: fullMessages,
      [this.getMaxTokensParam()]: maxTokens,
      temperature: this.getTemperature()
    }
    
    // 添加工具
    if (tools && tools.length > 0) {
      request.tools = this.buildTools(tools)
      request.tool_choice = 'auto'
    }
    
    // 添加流式选项
    if (stream) {
      request.stream = true
      request.stream_options = {
        include_usage: true
      }
    }
    
    // O1模型的特殊处理
    if (this.modelProfile.modelName.startsWith('o1')) {
      delete request.temperature  // O1不支持temperature
      delete request.stream  // O1不支持流式
      delete request.stream_options
    }
    
    return request
  }
  
  buildTools(tools: Tool[]): any[] {
    // Chat Completions只支持传统的function calling
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputJSONSchema || zodToJsonSchema(tool.inputSchema)
      }
    }))
  }
  
  parseResponse(response: any): UnifiedResponse {
    const choice = response.choices?.[0]
    
    return {
      id: response.id || `chatcmpl_${Date.now()}`,
      content: choice?.message?.content || '',
      toolCalls: choice?.message?.tool_calls || [],
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0
      }
    }
  }
  
  private buildMessages(systemPrompt: string[], messages: any[]): any[] {
    // 合并系统提示和消息
    const systemMessages = systemPrompt.map(prompt => ({
      role: 'system',
      content: prompt
    }))
    
    return [...systemMessages, ...messages]
  }
}
```

### Step 1.6: 创建适配器工厂

**文件**: `src/services/modelAdapterFactory.ts` (新建)

**任务**: 创建工厂类来选择合适的适配器

```typescript
import { ModelAPIAdapter } from './adapters/base'
import { ResponsesAPIAdapter } from './adapters/responsesAPI'
import { ChatCompletionsAdapter } from './adapters/chatCompletions'
import { getModelCapabilities } from '../constants/modelCapabilities'
import { ModelProfile, getGlobalConfig } from '../utils/config'
import { ModelCapabilities } from '../types/modelCapabilities'

export class ModelAdapterFactory {
  /**
   * 根据模型配置创建合适的适配器
   */
  static createAdapter(modelProfile: ModelProfile): ModelAPIAdapter {
    const capabilities = getModelCapabilities(modelProfile.modelName)
    
    // 决定使用哪种API
    const apiType = this.determineAPIType(modelProfile, capabilities)
    
    // 创建对应的适配器
    switch (apiType) {
      case 'responses_api':
        return new ResponsesAPIAdapter(capabilities, modelProfile)
      case 'chat_completions':
      default:
        return new ChatCompletionsAdapter(capabilities, modelProfile)
    }
  }
  
  /**
   * 决定应该使用哪种API
   */
  private static determineAPIType(
    modelProfile: ModelProfile,
    capabilities: ModelCapabilities
  ): 'responses_api' | 'chat_completions' {
    // 如果模型不支持Responses API，直接使用Chat Completions
    if (capabilities.apiArchitecture.primary !== 'responses_api') {
      return 'chat_completions'
    }
    
    // 检查是否是官方OpenAI端点
    const isOfficialOpenAI = !modelProfile.baseURL || 
      modelProfile.baseURL.includes('api.openai.com')
    
    // 非官方端点使用Chat Completions（即使模型支持Responses API）
    if (!isOfficialOpenAI) {
      // 如果有fallback选项，使用fallback
      if (capabilities.apiArchitecture.fallback === 'chat_completions') {
        return 'chat_completions'
      }
      // 否则使用primary（可能会失败，但让它尝试）
      return capabilities.apiArchitecture.primary
    }
    
    // 检查是否需要流式（Responses API暂不支持）
    const config = getGlobalConfig()
    if (config.stream && !capabilities.streaming.supported) {
      // 需要流式但Responses API不支持，降级到Chat Completions
      if (capabilities.apiArchitecture.fallback === 'chat_completions') {
        return 'chat_completions'
      }
    }
    
    // 使用主要API类型
    return capabilities.apiArchitecture.primary
  }
  
  /**
   * 检查模型是否应该使用Responses API
   */
  static shouldUseResponsesAPI(modelProfile: ModelProfile): boolean {
    const capabilities = getModelCapabilities(modelProfile.modelName)
    const apiType = this.determineAPIType(modelProfile, capabilities)
    return apiType === 'responses_api'
  }
}
```

---

## 🔄 Phase 2: 集成与测试（第3-4天）

### 目标
将新系统集成到现有代码中，与旧系统并行运行。

### Step 2.1: 修改claude.ts使用新系统

**文件**: `src/services/claude.ts` (修改)

**任务**: 在queryLLMWithProfile中添加新的适配器路径

**找到函数**: `queryLLMWithProfile` (约第1182行)

**修改内容**:

```typescript
// 在函数开头添加功能开关
const USE_NEW_ADAPTER_SYSTEM = process.env.USE_NEW_ADAPTERS !== 'false'

// 在获取modelProfile后添加新路径
if (USE_NEW_ADAPTER_SYSTEM) {
  // 🚀 新的适配器系统
  const adapter = ModelAdapterFactory.createAdapter(modelProfile)
  
  // 构建统一请求参数
  const unifiedParams: UnifiedRequestParams = {
    messages: openaiMessages,  // 使用已转换的OpenAI格式消息
    systemPrompt: openaiSystem.map(s => s.content),
    tools: toolSchemas,
    maxTokens: getMaxTokensFromProfile(modelProfile),
    stream: config.stream,
    reasoningEffort: modelProfile.reasoningEffort,
    temperature: isGPT5Model(model) ? 1 : MAIN_QUERY_TEMPERATURE
  }
  
  // 创建请求
  const request = adapter.createRequest(unifiedParams)
  
  // 判断使用哪个API端点
  if (ModelAdapterFactory.shouldUseResponsesAPI(modelProfile)) {
    // 调用Responses API（复用现有的callGPT5ResponsesAPI）
    const response = await callGPT5ResponsesAPI(modelProfile, request, signal)
    return adapter.parseResponse(response)
  } else {
    // 调用Chat Completions（复用现有逻辑）
    // ... 现有的Chat Completions调用代码
  }
} else {
  // 保留原有逻辑完全不变
  // ... 现有的所有代码
}
```

### Step 2.2: 添加测试脚本

**文件**: `src/test/testAdapters.ts` (新建)

**任务**: 创建测试脚本验证新系统

```typescript
import { ModelAdapterFactory } from '../services/modelAdapterFactory'
import { getGlobalConfig } from '../utils/config'

// 测试不同模型的适配器选择
const testModels = [
  { modelName: 'gpt-5', provider: 'openai' },
  { modelName: 'gpt-4o', provider: 'openai' },
  { modelName: 'claude-3-5-sonnet-20241022', provider: 'anthropic' },
  { modelName: 'o1', provider: 'openai' },
  { modelName: 'glm-5', provider: 'custom' }
]

testModels.forEach(model => {
  console.log(`Testing ${model.modelName}:`)
  const adapter = ModelAdapterFactory.createAdapter(model as any)
  console.log(`  Adapter type: ${adapter.constructor.name}`)
  console.log(`  Should use Responses API: ${ModelAdapterFactory.shouldUseResponsesAPI(model as any)}`)
})
```

### Step 2.3: 清理硬编码（可选，Phase 3再做）

**文件**: `src/services/openai.ts` (修改)

**任务**: 标记需要移除的硬编码部分（先不删除）

```typescript
// 在isGPT5Model函数上添加注释
/**
 * @deprecated 将被ModelCapabilities系统替代
 */
function isGPT5Model(modelName: string): boolean {
  return modelName.startsWith('gpt-5')
}
```

---

## 🚀 Phase 3: 优化与清理（第5-6天）

### 目标
移除旧代码，完全切换到新系统。

### Step 3.1: 移除功能开关

**文件**: `src/services/claude.ts`

**任务**: 移除USE_NEW_ADAPTER_SYSTEM检查，默认使用新系统

### Step 3.2: 清理硬编码函数

**文件列表**:
- `src/services/openai.ts` - 移除isGPT5Model函数
- `src/services/claude.ts` - 移除isGPT5Model函数  
- `src/services/openai.ts` - 移除MODEL_FEATURES常量

### Step 3.3: 更新文档

**文件**: `README.md`

**任务**: 添加新模型支持说明

```markdown
## 支持的模型

本系统通过能力声明系统支持以下API类型：
- Chat Completions API: GPT-4, Claude等传统模型
- Responses API: GPT-5, GPT-6, GLM-5等新一代模型

添加新模型只需在 `src/constants/modelCapabilities.ts` 中配置即可。
```

---

## ✅ 验证清单

### Phase 1完成标准
- [ ] 所有新文件创建完成
- [ ] 代码可以编译通过
- [ ] 现有功能完全不受影响

### Phase 2完成标准
- [ ] 新旧系统可以通过环境变量切换
- [ ] GPT-5可以正常使用
- [ ] 所有现有模型功能正常

### Phase 3完成标准
- [ ] 完全使用新系统
- [ ] 代码更简洁清晰
- [ ] 新模型可通过配置添加

---

## 🎯 关键注意事项

1. **不要删除任何现有功能代码**，直到Phase 3
2. **始终保持向后兼容**
3. **每个Phase结束后都要测试**
4. **如果出现问题可以立即回滚**

## 📝 外包程序员执行指南

1. **严格按照Phase顺序执行**，不要跳步
2. **复制粘贴提供的代码**，不要自己修改
3. **遇到问题立即停止并报告**
4. **每完成一个Step都要git commit**，方便回滚

---

此文档设计为"无脑执行"级别，外包程序员只需要：
1. 创建指定的文件
2. 复制粘贴提供的代码
3. 在指定位置修改代码
4. 运行测试验证

整个过程不需要理解业务逻辑，只需要机械执行即可。