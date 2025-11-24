import { ModelAPIAdapter, StreamingEvent } from './base'
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
    // Check if this is a streaming response (has ReadableStream body)
    if (response?.body instanceof ReadableStream) {
      // Use streaming helper for streaming responses
      const { assistantMessage } = await this.parseStreamingChatCompletion(response)

      return {
        id: assistantMessage.responseId,
        content: assistantMessage.message.content,
        toolCalls: assistantMessage.message.content
          .filter((block: any) => block.type === 'tool_use')
          .map((block: any) => ({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input)
            }
          })),
        usage: this.normalizeUsageForAdapter(assistantMessage.message.usage),
        responseId: assistantMessage.responseId
      }
    }

    // Process non-streaming response
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

  // New streaming method that yields events incrementally
  async *parseStreamingResponse(response: any): AsyncGenerator<StreamingEvent> {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    let responseId = response.id || `chatcmpl_${Date.now()}`
    let hasStarted = false
    let accumulatedContent = ''

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
              if (parsed.id) {
                responseId = parsed.id
              }

              // Handle content deltas
              const choice = parsed.choices?.[0]
              if (choice?.delta) {
                const delta = choice.delta.content || ''
                const reasoningDelta = choice.delta.reasoning_content || ''
                const fullDelta = delta + reasoningDelta

                if (fullDelta) {
                  // First content - yield message_start event
                  if (!hasStarted) {
                    yield {
                      type: 'message_start',
                      message: {
                        role: 'assistant',
                        content: []
                      },
                      responseId
                    }
                    hasStarted = true
                  }

                  accumulatedContent += fullDelta

                  // Yield text delta event
                  yield {
                    type: 'text_delta',
                    delta: fullDelta,
                    responseId
                  }
                }
              }

              // Handle tool calls
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
          }
        }
      }
    } catch (error) {
      console.error('Error reading streaming response:', error)
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      }
    } finally {
      reader.releaseLock()
    }

    // Build final response
    const finalContent = accumulatedContent
      ? [{ type: 'text', text: accumulatedContent, citations: [] }]
      : [{ type: 'text', text: '', citations: [] }]

    // Yield final message stop
    yield {
      type: 'message_stop',
      message: {
        id: responseId,
        role: 'assistant',
        content: finalContent,
        responseId
      }
    }
  }

  private async parseStreamingChatCompletion(response: any): Promise<{ assistantMessage: any; rawResponse: any }> {
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

  private normalizeUsageForAdapter(usage?: any) {
    if (!usage) {
      return {
        input_tokens: 0,
        output_tokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        reasoningTokens: 0
      }
    }

    const inputTokens =
      usage.input_tokens ??
      usage.prompt_tokens ??
      usage.promptTokens ??
      0
    const outputTokens =
      usage.output_tokens ??
      usage.completion_tokens ??
      usage.completionTokens ??
      0

    return {
      ...usage,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: usage.totalTokens ?? (inputTokens + outputTokens),
      reasoningTokens: usage.reasoningTokens ?? 0
    }
  }
}
