import { ModelCapabilities, UnifiedRequestParams, UnifiedResponse } from '@kode-types/modelCapabilities'
import { ModelProfile } from '@utils/config'
import { Tool } from '@tool'

// Streaming event types for async generator streaming
export type StreamingEvent =
  | { type: 'message_start', message: any, responseId: string }
  | { type: 'text_delta', delta: string, responseId: string }
  | { type: 'tool_request', tool: any }
  | { type: 'usage', usage: { promptTokens: number, completionTokens: number, reasoningTokens: number } }
  | { type: 'message_stop', message: any }
  | { type: 'error', error: string }

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
