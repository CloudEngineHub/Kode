import { ModelAPIAdapter } from './base'
import { UnifiedRequestParams, UnifiedResponse } from '@kode-types/modelCapabilities'
import { Tool } from '@tool'
import { zodToJsonSchema } from 'zod-to-json-schema'

export class ResponsesAPIAdapter extends ModelAPIAdapter {
  createRequest(params: UnifiedRequestParams): any {
    const { messages, systemPrompt, tools, maxTokens, stream, reasoningEffort } = params

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

    // Add reasoning control - include array is required for reasoning content
    const include: string[] = []
    if (this.shouldIncludeReasoningEffort() || reasoningEffort) {
      include.push('reasoning.encrypted_content')
      request.reasoning = {
        effort: reasoningEffort || this.modelProfile.reasoningEffort || 'medium'
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
    }

    // Add tool choice - use simple format like codex-cli.js
    request.tool_choice = 'auto'

    // Add parallel tool calls flag
    request.parallel_tool_calls = this.capabilities.toolCalling.supportsParallelCalls

    // Add store flag
    request.store = false

    // Add state management
    if (params.previousResponseId && this.capabilities.stateManagement.supportsPreviousResponseId) {
      request.previous_response_id = params.previousResponseId
    }

    // Add include array for reasoning and other content
    if (include.length > 0) {
      request.include = include
    }

    return request
  }
  
  buildTools(tools: Tool[]): any[] {
    // Follow codex-cli.js format: flat structure, no nested 'function' object
    return tools.map(tool => {
      // Prefer pre-built JSON schema if available
      let parameters = tool.inputJSONSchema

      // Otherwise, check if inputSchema is already a JSON schema (not Zod)
      if (!parameters && tool.inputSchema) {
        // Check if it's already a JSON schema (has 'type' property) vs a Zod schema
        if (tool.inputSchema.type || tool.inputSchema.properties) {
          // Already a JSON schema, use directly
          parameters = tool.inputSchema
        } else {
          // Try to convert Zod schema
          try {
            parameters = zodToJsonSchema(tool.inputSchema)
          } catch (error) {
            console.warn(`Failed to convert Zod schema for tool ${tool.name}:`, error)
            // Use minimal schema as fallback
            parameters = { type: 'object', properties: {} }
          }
        }
      }

      return {
        type: 'function',
        name: tool.name,
        description: typeof tool.description === 'function'
          ? 'Tool with dynamic description'
          : (tool.description || ''),
        parameters: parameters || { type: 'object', properties: {} }
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
    // Convert content to array format for Anthropic compatibility
    const contentArray = content
      ? [{ type: 'text', text: content, citations: [] }]
      : [{ type: 'text', text: '', citations: [] }]

    return {
      id: response.id || `resp_${Date.now()}`,
      content: contentArray,  // Return as array (Anthropic format)
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
