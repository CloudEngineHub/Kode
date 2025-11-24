import { OpenAIAdapter, StreamingEvent } from './openaiAdapter'
import { UnifiedRequestParams, UnifiedResponse } from '@kode-types/modelCapabilities'
import { Tool } from '@tool'
import { zodToJsonSchema } from 'zod-to-json-schema'

export class ChatCompletionsAdapter extends OpenAIAdapter {
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
  
  // parseResponse is now handled by the base OpenAIAdapter class

  // Implement abstract method from OpenAIAdapter - Chat Completions specific non-streaming
  protected parseNonStreamingResponse(response: any): UnifiedResponse {
    const choice = response.choices?.[0]

    return {
      id: response.id || `chatcmpl_${Date.now()}`,
      content: choice?.message?.content || '',
      toolCalls: choice?.message?.tool_calls || [],
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
        totalTokens: (response.usage?.prompt_tokens || 0) + (response.usage?.completion_tokens || 0)
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

  // Implement abstract method from OpenAIAdapter - Chat Completions specific streaming logic
  protected *processStreamingChunk(
    parsed: any,
    responseId: string,
    hasStarted: boolean,
    accumulatedContent: string
  ): AsyncGenerator<StreamingEvent> {
    // Handle content deltas (Chat Completions format)
    const choice = parsed.choices?.[0]
    if (choice?.delta) {
      const delta = choice.delta.content || ''
      const reasoningDelta = choice.delta.reasoning_content || ''
      const fullDelta = delta + reasoningDelta

      if (fullDelta) {
        const textEvents = this.handleTextDelta(fullDelta, responseId, hasStarted)
        for (const event of textEvents) {
          yield event
        }
      }
    }

    // Handle tool calls (Chat Completions format)
    if (choice?.delta?.tool_calls) {
      for (const toolCall of choice.delta.tool_calls) {
        yield {
          type: 'tool_request',
          tool: {
            id: toolCall.id,
            name: toolCall.function?.name,
            input: toolCall.function?.arguments || '{}'
          }
        }
      }
    }

    // Handle usage information
    if (parsed.usage) {
      const promptTokens = parsed.usage.prompt_tokens || 0
      const completionTokens = parsed.usage.completion_tokens || 0
      const totalTokens = parsed.usage.total_tokens ?? (promptTokens + completionTokens)

      yield {
        type: 'usage',
        usage: {
          promptTokens,
          completionTokens,
          input_tokens: promptTokens,
          output_tokens: completionTokens,
          totalTokens,
          reasoningTokens: 0 // Chat Completions doesn't have reasoning tokens
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
    const choice = parsed.choices?.[0]
    if (choice?.delta) {
      const delta = choice.delta.content || ''
      const reasoningDelta = choice.delta.reasoning_content || ''
      const fullDelta = delta + reasoningDelta

      if (fullDelta) {
        state.content = accumulatedContent + fullDelta
        state.hasStarted = true
      }
    }

    return state
  }

  // Implement abstract method for parsing streaming OpenAI responses
  protected async parseStreamingOpenAIResponse(response: any): Promise<{ assistantMessage: any; rawResponse: any }> {
    const contentBlocks: any[] = []
    const usage: any = {
      prompt_tokens: 0,
      completion_tokens: 0,
    }

    let responseId = response.id || `chatcmpl_${Date.now()}`
    const pendingToolCalls: any[] = []

    for await (const event of this.parseStreamingResponse(response)) {
      if (event.type === 'message_start') {
        responseId = event.responseId || responseId
        continue
      }

      if (event.type === 'text_delta') {
        const last = contentBlocks[contentBlocks.length - 1]
        if (!last || last.type !== 'text') {
          contentBlocks.push({ type: 'text', text: event.delta, citations: [] })
        } else {
          last.text += event.delta
        }
        continue
      }

      if (event.type === 'tool_request') {
        pendingToolCalls.push(event.tool)
        continue
      }

      if (event.type === 'usage') {
        usage.prompt_tokens =
          event.usage.input_tokens ?? event.usage.promptTokens ?? usage.prompt_tokens
        usage.completion_tokens =
          event.usage.output_tokens ?? event.usage.completionTokens ?? usage.completion_tokens
        usage.totalTokens =
          event.usage.totalTokens ??
          (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
        continue
      }
    }

    for (const toolCall of pendingToolCalls) {
      let toolArgs = {}
      try {
        toolArgs = toolCall.input ? JSON.parse(toolCall.input) : {}
      } catch {}

      contentBlocks.push({
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.name,
        input: toolArgs,
      })
    }

    const assistantMessage = {
      type: 'assistant',
      message: {
        role: 'assistant',
        content: contentBlocks,
        usage: {
          input_tokens: usage.prompt_tokens ?? 0,
          output_tokens: usage.completion_tokens ?? 0,
          prompt_tokens: usage.prompt_tokens ?? 0,
          completion_tokens: usage.completion_tokens ?? 0,
          totalTokens:
            usage.totalTokens ??
            (usage.prompt_tokens || 0) + (usage.completion_tokens || 0),
        },
      },
      costUSD: 0,
      durationMs: Date.now() - Date.now(), // Placeholder
      uuid: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}` as any,
      responseId,
    }

    return {
      assistantMessage,
      rawResponse: {
        id: responseId,
        content: contentBlocks,
        usage,
      },
    }
  }

  // Implement abstract method for usage normalization
  protected normalizeUsageForAdapter(usage?: any) {
    // Call the base implementation with Chat Completions specific defaults
    return super.normalizeUsageForAdapter(usage)
  }
}
