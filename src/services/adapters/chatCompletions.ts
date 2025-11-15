import { ModelAPIAdapter } from './base'
import { UnifiedRequestParams, UnifiedResponse } from '@kode-types/modelCapabilities'
import { Tool } from '@tool'
import { zodToJsonSchema } from 'zod-to-json-schema'

export class ChatCompletionsAdapter extends ModelAPIAdapter {
  createRequest(params: UnifiedRequestParams): any {
    const { messages, systemPrompt, tools, maxTokens, stream } = params
    
    // Build complete message list (including system prompts)
    const fullMessages = this.buildMessages(systemPrompt, messages)
    
    // Build request
    const request: any = {
      model: this.modelProfile.modelName,
      messages: fullMessages,
      [this.getMaxTokensParam()]: maxTokens,
      temperature: this.getTemperature()
    }
    
    // Add tools
    if (tools && tools.length > 0) {
      request.tools = this.buildTools(tools)
      request.tool_choice = 'auto'
    }
    
    // Add reasoning effort for GPT-5 via Chat Completions
    if (this.shouldIncludeReasoningEffort() && params.reasoningEffort) {
      request.reasoning_effort = params.reasoningEffort  // Chat Completions format
    }
    
    // Add verbosity for GPT-5 via Chat Completions
    if (this.shouldIncludeVerbosity() && params.verbosity) {
      request.verbosity = params.verbosity  // Chat Completions format
    }
    
    // Add streaming options
    if (stream) {
      request.stream = true
      request.stream_options = {
        include_usage: true
      }
    }
    
    // O1 model special handling
    if (this.modelProfile.modelName.startsWith('o1')) {
      delete request.temperature  // O1 doesn't support temperature
      delete request.stream  // O1 doesn't support streaming
      delete request.stream_options
    }
    
    return request
  }
  
  buildTools(tools: Tool[]): any[] {
    // Chat Completions only supports traditional function calling
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputJSONSchema || zodToJsonSchema(tool.inputSchema)
      }
    }))
  }
  
  async parseResponse(response: any): Promise<UnifiedResponse> {
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
    // Merge system prompts and messages
    const systemMessages = systemPrompt.map(prompt => ({
      role: 'system',
      content: prompt
    }))
    
    return [...systemMessages, ...messages]
  }
}
