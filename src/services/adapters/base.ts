import { ModelCapabilities, UnifiedRequestParams, UnifiedResponse } from '@kode-types/modelCapabilities'
import { ModelProfile } from '@utils/config'
import { Tool } from '@tool'

export abstract class ModelAPIAdapter {
  constructor(
    protected capabilities: ModelCapabilities,
    protected modelProfile: ModelProfile
  ) {}
  
  // Subclasses must implement these methods
  abstract createRequest(params: UnifiedRequestParams): any
  abstract parseResponse(response: any): Promise<UnifiedResponse>
  abstract buildTools(tools: Tool[]): any
  
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
