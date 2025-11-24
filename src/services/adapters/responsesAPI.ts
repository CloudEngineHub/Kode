import { OpenAIAdapter, StreamingEvent } from './openaiAdapter'
import { UnifiedRequestParams, UnifiedResponse } from '@kode-types/modelCapabilities'
import { Tool } from '@tool'
import { zodToJsonSchema } from 'zod-to-json-schema'

export class ResponsesAPIAdapter extends OpenAIAdapter {
  createRequest(params: UnifiedRequestParams): any {
    const { messages, systemPrompt, tools, maxTokens, reasoningEffort } = params

    // Build base request
    const request: any = {
      model: this.modelProfile.modelName,
      input: this.convertMessagesToInput(messages),
      instructions: this.buildInstructions(systemPrompt)
    }

    // Add token limit - Responses API uses max_output_tokens
    request.max_output_tokens = maxTokens

    // Add streaming support - allow disabling when caller requests buffered mode
    request.stream = params.stream !== false

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
        // Type guard to check if it's a plain JSON schema object
        const isPlainObject = (obj: any): boolean => {
          return obj !== null && typeof obj === 'object' && !Array.isArray(obj)
        }

        if (isPlainObject(tool.inputSchema) && ('type' in tool.inputSchema || 'properties' in tool.inputSchema)) {
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

      let description: string
      if (typeof tool.description === 'function') {
        // For async functions, we can't await in sync context
        // Use a fallback approach - try to get cached description or use name
        description = `Tool: ${tool.name}`

        // Try to get description synchronously if possible
        try {
          // Some tools might have a cached description property
          if ('cachedDescription' in tool) {
            description = (tool as any).cachedDescription
          }
        } catch (error) {
          // Keep fallback
        }
      } else {
        description = tool.description || `Tool: ${tool.name}`
      }

      return {
        type: 'function',
        name: tool.name,
        description,
        parameters: parameters || { type: 'object', properties: {} }
      }
    })
  }
  
  // parseResponse is now handled by the base OpenAIAdapter class

  // Implement abstract method from OpenAIAdapter
  protected parseNonStreamingResponse(response: any): UnifiedResponse {
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

    const promptTokens = response.usage?.input_tokens || 0
    const completionTokens = response.usage?.output_tokens || 0
    const totalTokens = response.usage?.total_tokens ?? (promptTokens + completionTokens)

    return {
      id: response.id || `resp_${Date.now()}`,
      content: contentArray,  // Return as array (Anthropic format)
      toolCalls,
      usage: {
        promptTokens,
        completionTokens,
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        totalTokens,
        reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens
      },
      responseId: response.id  // Save for state management
    }
  }

  // Implement abstract method from OpenAIAdapter - Responses API specific streaming logic
  protected *processStreamingChunk(
    parsed: any,
    responseId: string,
    hasStarted: boolean,
    accumulatedContent: string
  ): AsyncGenerator<StreamingEvent> {
    // Handle text content deltas (Responses API format)
    if (parsed.type === 'response.output_text.delta') {
      const delta = parsed.delta || ''
      if (delta) {
        const textEvents = this.handleTextDelta(delta, responseId, hasStarted)
        for (const event of textEvents) {
          yield event
        }
      }
    }

    // Handle tool calls (Responses API format)
    if (parsed.type === 'response.output_item.done') {
      const item = parsed.item || {}
      if (item.type === 'function_call') {
        const callId = item.call_id || item.id
        const name = item.name
        const args = item.arguments

        if (typeof callId === 'string' && typeof name === 'string' && typeof args === 'string') {
          yield {
            type: 'tool_request',
            tool: {
              id: callId,
              name: name,
              input: args
            }
          }
        }
      }
    }

    // Handle usage information
    if (parsed.usage) {
      const promptTokens = parsed.usage.input_tokens || 0
      const completionTokens = parsed.usage.output_tokens || 0
      const totalTokens = parsed.usage.total_tokens ?? (promptTokens + completionTokens)

      yield {
        type: 'usage',
        usage: {
          promptTokens,
          completionTokens,
          input_tokens: promptTokens,
          output_tokens: completionTokens,
          totalTokens,
          reasoningTokens: parsed.usage.output_tokens_details?.reasoning_tokens || 0
        }
      }
    }
  }

  protected updateStreamingState(
    parsed: any,
    accumulatedContent: string
  ): { content?: string; hasStarted?: boolean } {
    const state: { content?: string; hasStarted?: boolean } = {}

    // Check if we have content delta
    if (parsed.type === 'response.output_text.delta' && parsed.delta) {
      state.content = accumulatedContent + parsed.delta
      state.hasStarted = true
    }

    return state
  }

  // parseStreamingResponse and parseSSEChunk are now handled by the base OpenAIAdapter class

  // Implement abstract method for parsing streaming OpenAI responses
  protected async parseStreamingOpenAIResponse(response: any): Promise<{ assistantMessage: any; rawResponse: any }> {
    // Delegate to the processResponsesStream helper for consistency
    const { processResponsesStream } = await import('./responsesStreaming')

    return await processResponsesStream(
      this.parseStreamingResponse(response),
      Date.now(),
      response.id ?? `resp_${Date.now()}`
    )
  }

  // Implement abstract method for usage normalization
  protected normalizeUsageForAdapter(usage?: any) {
    // Call the base implementation with Responses API specific defaults
    const baseUsage = super.normalizeUsageForAdapter(usage)

    // Add any Responses API specific usage fields
    return {
      ...baseUsage,
      reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? 0
    }
  }
  
  private convertMessagesToInput(messages: any[]): any[] {
    // Convert Chat Completions messages to Response API input format
    // Following reference implementation pattern
    const inputItems = []

    for (const message of messages) {
      const role = message.role

      if (role === 'tool') {
        // Handle tool call results - enhanced following codex-cli.js pattern
        const callId = message.tool_call_id || message.id
        if (typeof callId === 'string' && callId) {
          let content = message.content || ''
          if (Array.isArray(content)) {
            const texts = []
            for (const part of content) {
              if (typeof part === 'object' && part !== null) {
                const t = part.text || part.content
                if (typeof t === 'string' && t) {
                  texts.push(t)
                }
              }
            }
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
        // Handle assistant tool calls - enhanced following codex-cli.js pattern
        for (const tc of message.tool_calls) {
          if (typeof tc !== 'object' || tc === null) {
            continue
          }
          const tcType = tc.type || 'function'
          if (tcType !== 'function') {
            continue
          }
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
    // Enhanced tool call parsing following codex-cli.js pattern
    if (!response.output || !Array.isArray(response.output)) {
      return []
    }

    const toolCalls = []

    for (const item of response.output) {
      if (item.type === 'function_call') {
        // Parse tool call with better structure
        const callId = item.call_id || item.id
        const name = item.name || ''
        const args = item.arguments || '{}'

        // Validate required fields
        if (typeof callId === 'string' && typeof name === 'string' && typeof args === 'string') {
          toolCalls.push({
            id: callId,
            type: 'function',
            function: {
              name: name,
              arguments: args
            }
          })
        }
      } else if (item.type === 'tool_call') {
        // Handle alternative tool_call type
        const callId = item.id || `tool_${Math.random().toString(36).substring(2, 15)}`
        toolCalls.push({
          id: callId,
          type: 'tool_call',
          name: item.name,
          arguments: item.arguments
        })
      }
    }

    return toolCalls
  }
}
