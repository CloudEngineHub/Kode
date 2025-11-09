import { ModelAPIAdapter } from './base'
import { UnifiedRequestParams, UnifiedResponse } from '@kode-types/modelCapabilities'
import { Tool } from '@tool'
import { zodToJsonSchema } from 'zod-to-json-schema'

export class ResponsesAPIAdapter extends ModelAPIAdapter {
  createRequest(params: UnifiedRequestParams): any {
    const { messages, systemPrompt, tools, maxTokens, stream } = params

    // Build base request
    const request: any = {
      model: this.modelProfile.modelName,
      input: this.convertMessagesToInput(messages),
      instructions: this.buildInstructions(systemPrompt)
    }
    
    // Add token limit - Responses API uses max_output_tokens
    request.max_output_tokens = maxTokens

    // Add streaming support - Responses API always returns streaming
    request.stream = true

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
  
  async parseResponse(response: any): Promise<UnifiedResponse> {
    // Check if this is a streaming response (Response object with body)
    if (response && typeof response === 'object' && 'body' in response && response.body) {
      return await this.parseStreamingResponse(response)
    }

    // Process non-streaming response
    return this.parseNonStreamingResponse(response)
  }

  private parseNonStreamingResponse(response: any): UnifiedResponse {
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

  private async parseStreamingResponse(response: any): Promise<UnifiedResponse> {
    // Handle streaming response from Responses API
    // Collect all chunks and build a unified response

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    let fullContent = ''
    let toolCalls = []
    let responseId = response.id || `resp_${Date.now()}`

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            const parsed = this.parseSSEChunk(line)
            if (parsed) {
              // Extract response ID
              if (parsed.response?.id) {
                responseId = parsed.response.id
              }

              // Handle text content
              if (parsed.type === 'response.output_text.delta') {
                fullContent += parsed.delta || ''
              }

              // Handle tool calls
              if (parsed.type === 'response.output_item.done') {
                const item = parsed.item || {}
                if (item.type === 'function_call') {
                  toolCalls.push({
                    id: item.call_id || item.id || `tool_${Date.now()}`,
                    type: 'tool_call',
                    name: item.name,
                    arguments: item.arguments
                  })
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error reading streaming response:', error)
    }

    // Build unified response
    return {
      id: responseId,
      content: fullContent,
      toolCalls,
      usage: {
        promptTokens: 0, // Will be filled in by the caller
        completionTokens: 0,
        reasoningTokens: 0
      },
      responseId: responseId
    }
  }

  private parseSSEChunk(line: string): any | null {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim()
      if (data === '[DONE]') {
        return null
      }
      if (data) {
        try {
          return JSON.parse(data)
        } catch (error) {
          console.error('Error parsing SSE chunk:', error)
          return null
        }
      }
    }
    return null
  }
  
  private convertMessagesToInput(messages: any[]): any[] {
    // Convert Chat Completions messages to Response API input format
    // Following reference implementation pattern
    const inputItems = []

    for (const message of messages) {
      const role = message.role

      if (role === 'tool') {
        // Handle tool call results
        const callId = message.tool_call_id || message.id
        if (typeof callId === 'string' && callId) {
          let content = message.content || ''
          if (Array.isArray(content)) {
            const texts = content
              .filter(part => typeof part === 'object' && part !== null)
              .map(part => part.text || part.content)
              .filter(text => typeof text === 'string' && text)
            content = texts.join('\n')
          }
          if (typeof content === 'string') {
            inputItems.push({
              type: 'function_call_output',
              call_id: callId,
              output: content
            })
          }
        }
        continue
      }

      if (role === 'assistant' && Array.isArray(message.tool_calls)) {
        // Handle assistant tool calls
        for (const tc of message.tool_calls) {
          if (typeof tc !== 'object' || tc === null) continue
          const tcType = tc.type || 'function'
          if (tcType !== 'function') continue

          const callId = tc.id || tc.call_id
          const fn = tc.function
          const name = typeof fn === 'object' && fn !== null ? fn.name : null
          const args = typeof fn === 'object' && fn !== null ? fn.arguments : null

          if (typeof callId === 'string' && typeof name === 'string' && typeof args === 'string') {
            inputItems.push({
              type: 'function_call',
              name: name,
              arguments: args,
              call_id: callId
            })
          }
        }
        continue
      }

      // Handle regular text content
      const content = message.content || ''
      const contentItems = []

      if (Array.isArray(content)) {
        for (const part of content) {
          if (typeof part !== 'object' || part === null) continue
          const ptype = part.type
          if (ptype === 'text') {
            const text = part.text || part.content || ''
            if (typeof text === 'string' && text) {
              const kind = role === 'assistant' ? 'output_text' : 'input_text'
              contentItems.push({ type: kind, text: text })
            }
          } else if (ptype === 'image_url') {
            const image = part.image_url
            const url = typeof image === 'object' && image !== null ? image.url : image
            if (typeof url === 'string' && url) {
              contentItems.push({ type: 'input_image', image_url: url })
            }
          }
        }
      } else if (typeof content === 'string' && content) {
        const kind = role === 'assistant' ? 'output_text' : 'input_text'
        contentItems.push({ type: kind, text: content })
      }

      if (contentItems.length) {
        const roleOut = role === 'assistant' ? 'assistant' : 'user'
        inputItems.push({ type: 'message', role: roleOut, content: contentItems })
      }
    }

    return inputItems
  }
  
  private buildInstructions(systemPrompt: string[]): string {
    // Join system prompts into instructions (following reference implementation)
    const systemContent = systemPrompt
      .filter(content => content.trim())
      .join('\n\n')

    return systemContent
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
