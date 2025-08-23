import { ModelAPIAdapter } from './base'
import { UnifiedRequestParams, UnifiedResponse } from '../../types/modelCapabilities'
import { Tool } from '../../Tool'
import { zodToJsonSchema } from 'zod-to-json-schema'

export class ResponsesAPIAdapter extends ModelAPIAdapter {
  createRequest(params: UnifiedRequestParams): any {
    const { messages, systemPrompt, tools, maxTokens } = params
    
    // Separate system messages and user messages
    const systemMessages = messages.filter(m => m.role === 'system')
    const nonSystemMessages = messages.filter(m => m.role !== 'system')
    
    // Build base request
    const request: any = {
      model: this.modelProfile.modelName,
      input: this.convertMessagesToInput(nonSystemMessages),
      instructions: this.buildInstructions(systemPrompt, systemMessages)
    }
    
    // Add token limit
    request[this.getMaxTokensParam()] = maxTokens
    
    // Add temperature (GPT-5 only supports 1)
    if (this.getTemperature() === 1) {
      request.temperature = 1
    }
    
    // Add reasoning control - correct format for Responses API
    if (this.shouldIncludeReasoningEffort()) {
      request.reasoning = {
        effort: params.reasoningEffort || this.modelProfile.reasoningEffort || 'medium'
      }
    }
    
    // Add verbosity control - correct format for Responses API
    if (this.shouldIncludeVerbosity()) {
      request.text = {
        verbosity: params.verbosity || 'high'  // High verbosity for coding tasks
      }
    }
    
    // Add tools
    if (tools && tools.length > 0) {
      request.tools = this.buildTools(tools)
      
      // Handle allowed_tools
      if (params.allowedTools && this.capabilities.toolCalling.supportsAllowedTools) {
        request.tool_choice = {
          type: 'allowed_tools',
          mode: 'auto',
          tools: params.allowedTools
        }
      }
    }
    
    // Add state management
    if (params.previousResponseId && this.capabilities.stateManagement.supportsPreviousResponseId) {
      request.previous_response_id = params.previousResponseId
    }
    
    return request
  }
  
  buildTools(tools: Tool[]): any[] {
    // If freeform not supported, use traditional format
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
    
    // Custom tools format (GPT-5 feature)
    return tools.map(tool => {
      const hasSchema = tool.inputJSONSchema || tool.inputSchema
      const isCustom = !hasSchema
      
      if (isCustom) {
        // Custom tool format
        return {
          type: 'custom',
          name: tool.name,
          description: tool.description || ''
        }
      } else {
        // Traditional function format
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
    // Process basic text output
    let content = response.output_text || ''
    
    // Process structured output
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
    
    // Parse tool calls
    const toolCalls = this.parseToolCalls(response)
    
    // Build unified response
    return {
      id: response.id || `resp_${Date.now()}`,
      content,
      toolCalls,
      usage: {
        promptTokens: response.usage?.input_tokens || 0,
        completionTokens: response.usage?.output_tokens || 0,
        reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens
      },
      responseId: response.id  // Save for state management
    }
  }
  
  private convertMessagesToInput(messages: any[]): any {
    // Convert messages to Responses API input format
    // May need adjustment based on actual API specification
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
        arguments: item.arguments  // Can be text or JSON
      }))
  }
}