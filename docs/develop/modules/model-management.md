# Model Management System

## Overview

The Model Management System (`src/utils/model.ts`) provides a unified interface for managing multiple AI providers, model configurations, and intelligent model switching. It abstracts the complexity of different AI APIs behind a consistent interface.

## Core Architecture

### ModelManager Class

```typescript
export class ModelManager {
  private profiles: Map<string, ModelProfile>
  private pointers: ModelPointers
  private currentModel: ModelInfo
  private contextLimit: Map<string, number>
  
  constructor(config: ModelConfig) {
    this.loadProfiles(config.profiles)
    this.loadPointers(config.pointers)
    this.initializeContextLimits()
  }
  
  // Model resolution
  resolveModel(pointer: string): ModelInfo
  
  // Model switching
  switchToNextModel(reason: SwitchReason): ModelInfo
  
  // Context analysis
  analyzeContextCompatibility(messages: Message[]): ContextAnalysis
  
  // Profile management
  addProfile(profile: ModelProfile): void
  updateProfile(id: string, updates: Partial<ModelProfile>): void
  deleteProfile(id: string): void
}
```

## Model Configuration

### Model Profile Structure

```typescript
interface ModelProfile {
  id: string                    // Unique identifier
  name: string                  // Display name
  provider: ModelProvider       // 'anthropic' | 'openai' | 'bedrock' | 'vertex' | 'custom'
  config: {
    model: string              // Model identifier (e.g., 'claude-3-5-sonnet-20241022')
    baseURL?: string           // Custom endpoint URL
    apiKey?: string            // Provider API key
    maxTokens?: number         // Maximum output tokens
    temperature?: number       // Sampling temperature
    topP?: number             // Nucleus sampling
    topK?: number             // Top-K sampling
    stopSequences?: string[]   // Stop sequences
    systemPrompt?: string      // Default system prompt
    headers?: Record<string, string>  // Custom headers
    timeout?: number           // Request timeout
    retryConfig?: RetryConfig // Retry configuration
  }
  capabilities?: {
    supportsTools: boolean     // Tool/function calling support
    supportsVision: boolean    // Image input support
    supportsStreaming: boolean // Streaming response support
    maxContextTokens: number   // Context window size
    costPer1kTokens: {
      input: number
      output: number
    }
  }
  metadata?: {
    description?: string       // Profile description
    tags?: string[]           // Classification tags
    createdAt?: Date
    updatedAt?: Date
    usageCount?: number
  }
}
```

### Model Pointers

```typescript
interface ModelPointers {
  main: string        // Primary conversation model
  task: string        // Task execution model (fast, efficient)
  reasoning: string   // Complex reasoning model (powerful)
  quick: string       // Quick responses (ultra-fast)
  vision?: string     // Image analysis model
  code?: string       // Code-specific model
  [key: string]: string | undefined  // Custom pointers
}
```

### Default Profiles

```typescript
const DEFAULT_PROFILES: ModelProfile[] = [
  {
    id: 'claude-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    config: {
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 8192,
      temperature: 0.7
    },
    capabilities: {
      supportsTools: true,
      supportsVision: true,
      supportsStreaming: true,
      maxContextTokens: 200000,
      costPer1kTokens: {
        input: 0.003,
        output: 0.015
      }
    }
  },
  {
    id: 'claude-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    config: {
      model: 'claude-3-5-haiku-20241022',
      maxTokens: 8192,
      temperature: 0.7
    },
    capabilities: {
      supportsTools: true,
      supportsVision: false,
      supportsStreaming: true,
      maxContextTokens: 200000,
      costPer1kTokens: {
        input: 0.0008,
        output: 0.004
      }
    }
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    config: {
      model: 'gpt-4o',
      maxTokens: 4096,
      temperature: 0.7
    },
    capabilities: {
      supportsTools: true,
      supportsVision: true,
      supportsStreaming: true,
      maxContextTokens: 128000,
      costPer1kTokens: {
        input: 0.0025,
        output: 0.01
      }
    }
  }
]
```

## Provider Integration

### Provider Factory

```typescript
class ProviderFactory {
  static createProvider(profile: ModelProfile): AIProvider {
    switch (profile.provider) {
      case 'anthropic':
        return new AnthropicProvider(profile)
      
      case 'openai':
        return new OpenAIProvider(profile)
      
      case 'bedrock':
        return new BedrockProvider(profile)
      
      case 'vertex':
        return new VertexProvider(profile)
      
      case 'custom':
        return new CustomProvider(profile)
      
      default:
        throw new Error(`Unknown provider: ${profile.provider}`)
    }
  }
}
```

### Anthropic Provider

```typescript
class AnthropicProvider implements AIProvider {
  private client: Anthropic
  private profile: ModelProfile
  
  constructor(profile: ModelProfile) {
    this.profile = profile
    this.client = new Anthropic({
      apiKey: profile.config.apiKey || process.env.ANTHROPIC_API_KEY,
      baseURL: profile.config.baseURL,
      defaultHeaders: profile.config.headers,
      timeout: profile.config.timeout
    })
  }
  
  async createMessage(request: MessageRequest): Promise<MessageResponse> {
    const response = await this.client.messages.create({
      model: this.profile.config.model,
      messages: this.convertMessages(request.messages),
      max_tokens: request.maxTokens || this.profile.config.maxTokens,
      temperature: request.temperature || this.profile.config.temperature,
      system: request.systemPrompt,
      tools: this.convertTools(request.tools),
      stream: request.stream
    })
    
    return this.normalizeResponse(response)
  }
  
  async *streamMessage(
    request: MessageRequest
  ): AsyncGenerator<StreamEvent> {
    const stream = await this.client.messages.stream({
      ...this.buildRequest(request),
      stream: true
    })
    
    for await (const event of stream) {
      yield this.normalizeStreamEvent(event)
    }
  }
}
```

### OpenAI Provider

```typescript
class OpenAIProvider implements AIProvider {
  private client: OpenAI
  private profile: ModelProfile
  
  constructor(profile: ModelProfile) {
    this.profile = profile
    this.client = new OpenAI({
      apiKey: profile.config.apiKey || process.env.OPENAI_API_KEY,
      baseURL: profile.config.baseURL,
      defaultHeaders: profile.config.headers,
      timeout: profile.config.timeout
    })
  }
  
  async createMessage(request: MessageRequest): Promise<MessageResponse> {
    const completion = await this.client.chat.completions.create({
      model: this.profile.config.model,
      messages: this.convertMessages(request.messages),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      functions: this.convertTools(request.tools),
      stream: request.stream
    })
    
    return this.normalizeResponse(completion)
  }
  
  private convertMessages(messages: Message[]): OpenAIMessage[] {
    return messages.map(msg => ({
      role: this.mapRole(msg.role),
      content: msg.content,
      name: msg.name,
      function_call: msg.toolCalls?.[0]
    }))
  }
}
```

### Custom Provider

```typescript
class CustomProvider implements AIProvider {
  private profile: ModelProfile
  private httpClient: HTTPClient
  
  constructor(profile: ModelProfile) {
    this.profile = profile
    this.httpClient = new HTTPClient({
      baseURL: profile.config.baseURL,
      headers: {
        'Authorization': `Bearer ${profile.config.apiKey}`,
        ...profile.config.headers
      },
      timeout: profile.config.timeout
    })
  }
  
  async createMessage(request: MessageRequest): Promise<MessageResponse> {
    // Custom API implementation
    const response = await this.httpClient.post('/v1/messages', {
      model: this.profile.config.model,
      ...this.transformRequest(request)
    })
    
    return this.normalizeResponse(response)
  }
  
  private transformRequest(request: MessageRequest): any {
    // Transform to custom API format
    return {
      prompt: this.buildPrompt(request.messages),
      max_length: request.maxTokens,
      temperature: request.temperature,
      // Custom transformations...
    }
  }
}
```

## Model Selection Logic

### Intelligent Model Selection

```typescript
class ModelSelector {
  selectModel(context: SelectionContext): ModelProfile {
    // Priority-based selection
    const candidates = this.filterCandidates(context)
    
    // Score each candidate
    const scored = candidates.map(model => ({
      model,
      score: this.scoreModel(model, context)
    }))
    
    // Sort by score and select best
    scored.sort((a, b) => b.score - a.score)
    return scored[0].model
  }
  
  private scoreModel(
    model: ModelProfile,
    context: SelectionContext
  ): number {
    let score = 0
    
    // Context size compatibility
    if (context.tokenCount <= model.capabilities.maxContextTokens) {
      score += 100
    } else {
      return -1 // Disqualify if context too large
    }
    
    // Tool support requirement
    if (context.requiresTools && model.capabilities.supportsTools) {
      score += 50
    } else if (context.requiresTools) {
      return -1 // Disqualify if tools required but not supported
    }
    
    // Cost optimization
    const costScore = 100 - (model.capabilities.costPer1kTokens.input * 10)
    score += costScore * context.costWeight
    
    // Speed optimization
    if (context.prioritizeSpeed && model.metadata?.tags?.includes('fast')) {
      score += 50
    }
    
    // Quality optimization
    if (context.prioritizeQuality && model.metadata?.tags?.includes('powerful')) {
      score += 50
    }
    
    return score
  }
}
```

### Context-Based Switching

```typescript
class ContextAnalyzer {
  analyzeContext(messages: Message[]): ContextAnalysis {
    const tokenCount = this.countTokens(messages)
    const hasImages = this.detectImages(messages)
    const codeRatio = this.calculateCodeRatio(messages)
    const complexity = this.estimateComplexity(messages)
    
    return {
      tokenCount,
      hasImages,
      codeRatio,
      complexity,
      recommendedModel: this.recommendModel({
        tokenCount,
        hasImages,
        codeRatio,
        complexity
      })
    }
  }
  
  private countTokens(messages: Message[]): number {
    // Use tiktoken for accurate counting
    const encoder = getEncoding('cl100k_base')
    
    let total = 0
    for (const message of messages) {
      const tokens = encoder.encode(message.content)
      total += tokens.length
      
      // Add overhead for message structure
      total += 4 // role, content markers
    }
    
    encoder.free()
    return total
  }
  
  private estimateComplexity(messages: Message[]): ComplexityLevel {
    const indicators = {
      multiStep: /step \d+|first|then|finally/i,
      technical: /algorithm|optimize|refactor|architecture/i,
      analysis: /analyze|explain|compare|evaluate/i,
      creative: /create|design|generate|imagine/i
    }
    
    let score = 0
    for (const message of messages) {
      for (const [type, pattern] of Object.entries(indicators)) {
        if (pattern.test(message.content)) {
          score += 1
        }
      }
    }
    
    if (score >= 4) return 'high'
    if (score >= 2) return 'medium'
    return 'low'
  }
}
```

## Model Switching

### Automatic Switching

```typescript
class ModelSwitcher {
  async switchModel(
    reason: SwitchReason,
    currentModel: ModelProfile,
    context: SwitchContext
  ): Promise<ModelProfile> {
    switch (reason) {
      case 'CONTEXT_OVERFLOW':
        return this.switchToLargerContext(currentModel, context)
      
      case 'RATE_LIMITED':
        return this.switchToBackup(currentModel)
      
      case 'ERROR':
        return this.switchToFallback(currentModel)
      
      case 'COST_OPTIMIZATION':
        return this.switchToCheaper(currentModel, context)
      
      case 'QUALITY_NEEDED':
        return this.switchToStronger(currentModel)
      
      case 'SPEED_NEEDED':
        return this.switchToFaster(currentModel)
      
      default:
        return currentModel
    }
  }
  
  private async switchToLargerContext(
    current: ModelProfile,
    context: SwitchContext
  ): Promise<ModelProfile> {
    const candidates = this.getAllProfiles()
      .filter(p => p.capabilities.maxContextTokens > context.requiredTokens)
      .sort((a, b) => a.capabilities.maxContextTokens - b.capabilities.maxContextTokens)
    
    if (candidates.length === 0) {
      throw new Error('No model available with sufficient context')
    }
    
    // Choose smallest sufficient model for cost optimization
    return candidates[0]
  }
  
  private switchToBackup(current: ModelProfile): ModelProfile {
    // Define backup chain
    const backupChain = {
      'claude-3-5-sonnet': 'claude-3-5-haiku',
      'claude-3-5-haiku': 'gpt-4o',
      'gpt-4o': 'gpt-3.5-turbo',
      'gpt-3.5-turbo': 'claude-3-5-haiku'
    }
    
    const backupId = backupChain[current.id]
    return this.getProfile(backupId) || current
  }
}
```

### Manual Model Selection

```typescript
class ModelUI {
  async selectModel(
    profiles: ModelProfile[],
    current: ModelProfile
  ): Promise<ModelProfile> {
    const items = profiles.map(profile => ({
      label: this.formatProfileLabel(profile),
      value: profile.id,
      description: this.formatProfileDescription(profile)
    }))
    
    const selected = await prompt({
      type: 'select',
      message: 'Select a model:',
      choices: items,
      initial: current.id
    })
    
    return profiles.find(p => p.id === selected)!
  }
  
  private formatProfileLabel(profile: ModelProfile): string {
    const cost = profile.capabilities.costPer1kTokens
    const context = profile.capabilities.maxContextTokens
    
    return `${profile.name} (${this.formatTokens(context)} context, $${cost.input}/$${cost.output} per 1k)`
  }
  
  private formatTokens(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(0)}k`
    }
    return tokens.toString()
  }
}
```

## Cost Management

### Cost Tracking

```typescript
class CostTracker {
  private usage: Map<string, ModelUsage> = new Map()
  
  track(
    model: ModelProfile,
    inputTokens: number,
    outputTokens: number
  ): void {
    const usage = this.usage.get(model.id) || {
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      requests: 0
    }
    
    usage.inputTokens += inputTokens
    usage.outputTokens += outputTokens
    usage.requests += 1
    
    // Calculate cost
    const inputCost = (inputTokens / 1000) * model.capabilities.costPer1kTokens.input
    const outputCost = (outputTokens / 1000) * model.capabilities.costPer1kTokens.output
    usage.cost += inputCost + outputCost
    
    this.usage.set(model.id, usage)
    
    // Emit cost event
    this.emitCostUpdate(model.id, usage)
  }
  
  getUsageSummary(): UsageSummary {
    const summary: UsageSummary = {
      totalCost: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalRequests: 0,
      byModel: {}
    }
    
    for (const [modelId, usage] of this.usage) {
      summary.totalCost += usage.cost
      summary.totalInputTokens += usage.inputTokens
      summary.totalOutputTokens += usage.outputTokens
      summary.totalRequests += usage.requests
      summary.byModel[modelId] = { ...usage }
    }
    
    return summary
  }
  
  async enforceCostLimit(limit: number): Promise<void> {
    const summary = this.getUsageSummary()
    
    if (summary.totalCost >= limit) {
      throw new CostLimitExceededError(
        `Cost limit of $${limit} exceeded. Current: $${summary.totalCost.toFixed(4)}`
      )
    }
    
    if (summary.totalCost >= limit * 0.8) {
      this.emitCostWarning(summary.totalCost, limit)
    }
  }
}
```

### Cost Optimization

```typescript
class CostOptimizer {
  optimizeModelSelection(
    task: TaskType,
    budget: number,
    profiles: ModelProfile[]
  ): ModelProfile {
    // Estimate tokens for task
    const estimatedTokens = this.estimateTokensForTask(task)
    
    // Filter models within budget
    const affordable = profiles.filter(profile => {
      const cost = this.calculateCost(profile, estimatedTokens)
      return cost <= budget
    })
    
    if (affordable.length === 0) {
      throw new Error('No model available within budget')
    }
    
    // Select best quality within budget
    return this.selectBestQuality(affordable, task)
  }
  
  private estimateTokensForTask(task: TaskType): TokenEstimate {
    const estimates = {
      simple_question: { input: 500, output: 500 },
      code_generation: { input: 1000, output: 2000 },
      analysis: { input: 2000, output: 1500 },
      refactoring: { input: 3000, output: 3000 },
      complex_task: { input: 5000, output: 5000 }
    }
    
    return estimates[task] || estimates.complex_task
  }
}
```

## Model Profiles Management

### Profile CRUD Operations

```typescript
class ProfileManager {
  private profiles: Map<string, ModelProfile> = new Map()
  private configPath: string
  
  async loadProfiles(): Promise<void> {
    // Load from config file
    const config = await this.loadConfig()
    
    // Load default profiles
    for (const profile of DEFAULT_PROFILES) {
      this.profiles.set(profile.id, profile)
    }
    
    // Override with user profiles
    for (const profile of config.profiles || []) {
      this.profiles.set(profile.id, profile)
    }
  }
  
  async createProfile(profile: ModelProfile): Promise<void> {
    // Validate profile
    this.validateProfile(profile)
    
    // Check for duplicates
    if (this.profiles.has(profile.id)) {
      throw new Error(`Profile ${profile.id} already exists`)
    }
    
    // Add profile
    this.profiles.set(profile.id, {
      ...profile,
      metadata: {
        ...profile.metadata,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })
    
    // Save to config
    await this.saveProfiles()
  }
  
  async updateProfile(
    id: string,
    updates: Partial<ModelProfile>
  ): Promise<void> {
    const existing = this.profiles.get(id)
    if (!existing) {
      throw new Error(`Profile ${id} not found`)
    }
    
    // Merge updates
    const updated = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        updatedAt: new Date()
      }
    }
    
    // Validate updated profile
    this.validateProfile(updated)
    
    // Update and save
    this.profiles.set(id, updated)
    await this.saveProfiles()
  }
  
  private validateProfile(profile: ModelProfile): void {
    // Required fields
    if (!profile.id) throw new Error('Profile ID is required')
    if (!profile.name) throw new Error('Profile name is required')
    if (!profile.provider) throw new Error('Provider is required')
    if (!profile.config.model) throw new Error('Model is required')
    
    // Provider-specific validation
    switch (profile.provider) {
      case 'anthropic':
        this.validateAnthropicProfile(profile)
        break
      case 'openai':
        this.validateOpenAIProfile(profile)
        break
      case 'custom':
        this.validateCustomProfile(profile)
        break
    }
  }
}
```

## Error Handling

### Provider Errors

```typescript
class ProviderErrorHandler {
  async handleError(
    error: Error,
    provider: AIProvider,
    request: MessageRequest
  ): Promise<MessageResponse> {
    if (this.isRateLimitError(error)) {
      return this.handleRateLimit(provider, request)
    }
    
    if (this.isAuthError(error)) {
      return this.handleAuthError(provider)
    }
    
    if (this.isNetworkError(error)) {
      return this.retryWithBackoff(provider, request)
    }
    
    if (this.isContextLengthError(error)) {
      return this.handleContextOverflow(request)
    }
    
    // Unrecoverable error
    throw new ProviderError(error.message, provider, error)
  }
  
  private async handleRateLimit(
    provider: AIProvider,
    request: MessageRequest
  ): Promise<MessageResponse> {
    // Get retry-after header if available
    const retryAfter = this.extractRetryAfter(error)
    
    if (retryAfter) {
      await sleep(retryAfter * 1000)
      return provider.createMessage(request)
    }
    
    // Switch to backup provider
    const backup = this.getBackupProvider(provider)
    return backup.createMessage(request)
  }
}
```

The Model Management System provides comprehensive, flexible, and robust handling of multiple AI providers with intelligent model selection, cost optimization, and error recovery.