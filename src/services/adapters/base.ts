import { ModelCapabilities, UnifiedRequestParams, UnifiedResponse } from '@kode-types/modelCapabilities'
import { ModelProfile } from '@utils/config'
import { Tool } from '@tool'

// Canonical token representation - normalize once at the boundary
interface TokenUsage {
  input: number
  output: number
  total?: number
  reasoning?: number
}

// Streaming event types for async generator streaming
export type StreamingEvent =
  | { type: 'message_start', message: any, responseId: string }
  | { type: 'text_delta', delta: string, responseId: string }
  | { type: 'tool_request', tool: any }
  | { type: 'usage', usage: TokenUsage }
  | { type: 'message_stop', message: any }
  | { type: 'error', error: string }

// Normalize API-specific token names to canonical representation - do this ONCE at the boundary
function normalizeTokens(apiResponse: any): TokenUsage {
  return {
    input: apiResponse.prompt_tokens ?? apiResponse.input_tokens ?? apiResponse.promptTokens ?? 0,
    output: apiResponse.completion_tokens ?? apiResponse.output_tokens ?? apiResponse.completionTokens ?? 0,
    total: apiResponse.total_tokens ?? apiResponse.totalTokens,
    reasoning: apiResponse.reasoning_tokens ?? apiResponse.reasoningTokens
  }
}

export { TokenUsage, normalizeTokens }

export abstract class ModelAPIAdapter {
  constructor(
    protected capabilities: ModelCapabilities,
    protected modelProfile: ModelProfile
  ) {}

  // Subclasses must implement these methods
  abstract createRequest(params: UnifiedRequestParams): any
  abstract parseResponse(response: any): Promise<UnifiedResponse>
  abstract buildTools(tools: Tool[]): any

  // Optional: subclasses can implement streaming for real-time updates
  // Default implementation returns undefined (not supported)
  async *parseStreamingResponse?(response: any): AsyncGenerator<StreamingEvent> {
    // Not supported by default - subclasses can override
    return
    yield // unreachable, but satisfies TypeScript
  }
  
  // Shared utility methods
  protected getMaxTokensParam(): string {
    return this.capabilities.parameters.maxTokensField
  }
  
  protected getTemperature(): number {
    if (this.capabilities.parameters.temperatureMode === 'fixed_one') {
      return 1
    }
    if (this.capabilities.parameters.temperatureMode === 'restricted') {
      return Math.min(1, 0.7)
    }
    return 0.7
  }
  
  protected shouldIncludeReasoningEffort(): boolean {
    return this.capabilities.parameters.supportsReasoningEffort
  }
  
  protected shouldIncludeVerbosity(): boolean {
    return this.capabilities.parameters.supportsVerbosity
  }
}
