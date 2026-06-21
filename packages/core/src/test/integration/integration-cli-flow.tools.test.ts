import { describe, expect, test } from 'bun:test'
import { ModelAdapterFactory } from '#core/ai/modelAdapterFactory'
import { callGPT5ResponsesAPI } from '#core/ai/openai'
import {
  ACTIVE_PRODUCTION_MODELS,
  expectUnifiedUsage,
  getActiveProfile,
} from './integration-cli-flow.shared'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getInputItems(request: unknown): unknown[] {
  if (!isRecord(request)) return []
  const input = request.input
  return Array.isArray(input) ? input : []
}

describe('🔌 Integration: Full CLI Flow (Tools)', () => {
  if (ACTIVE_PRODUCTION_MODELS.length === 0) {
    test.skip('✅ Tools flow (requires API keys)', () => {})
    return
  }

  test(
    '✅ Tools: full tool call parsing flow (Responses API)',
    async () => {
      const ACTIVE_PROFILE = getActiveProfile()
      const adapter = ModelAdapterFactory.createAdapter(ACTIVE_PROFILE)
      const shouldUseResponses =
        ModelAdapterFactory.shouldUseResponsesAPI(ACTIVE_PROFILE)

      if (!shouldUseResponses) {
        console.log(
          '  ⚠️  SKIPPING: Not using Responses API (tools only tested for Responses API)',
        )
        return
      }

      const unifiedParams = {
        messages: [
          {
            role: 'user',
            content:
              'You MUST use the read_file tool to read the file at path "./package.json". Do not provide any answer without using this tool first.',
          },
        ],
        systemPrompt: ['You are a helpful assistant.'],
        tools: [
          {
            name: 'read_file',
            description: 'Read file contents from the filesystem',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'The path to the file to read',
                },
              },
              required: ['path'],
            },
          },
        ],
        maxTokens: 100,
        stream: true,
        reasoningEffort: 'high' as const,
        temperature: 1,
        verbosity: 'high' as const,
      }

      const request = adapter.createRequest(unifiedParams)

      if (request.tools) {
        request.tools.forEach((tool: unknown, i: number) => {
          console.log(`  Tool ${i}:`, JSON.stringify(tool, null, 2))
        })
      }

      const response = await callGPT5ResponsesAPI(ACTIVE_PROFILE, request)
      const unifiedResponse = await adapter.parseResponse(response)

      expect(unifiedResponse).toBeDefined()
      expect(unifiedResponse.id).toBeDefined()
      expect(unifiedResponse.content).toBeDefined()
      expect(Array.isArray(unifiedResponse.content)).toBe(true)
      expectUnifiedUsage(unifiedResponse.usage)

      if (unifiedResponse.toolCalls && unifiedResponse.toolCalls.length > 0) {
        unifiedResponse.toolCalls.forEach((tc: unknown, i: number) => {
          console.log(`  Tool Call ${i}:`, JSON.stringify(tc, null, 2))
        })
      }
    },
    { timeout: 15000 },
  )

  test(
    '✅ Tools: tool result message conversion produces function_call_output (Responses API)',
    async () => {
      const ACTIVE_PROFILE = getActiveProfile()
      const adapter = ModelAdapterFactory.createAdapter(ACTIVE_PROFILE)
      const shouldUseResponses =
        ModelAdapterFactory.shouldUseResponsesAPI(ACTIVE_PROFILE)

      if (!shouldUseResponses) {
        console.log('  ⚠️  SKIPPING: Not using Responses API')
        return
      }

      const unifiedParams = {
        messages: [
          { role: 'user', content: 'Can you read the package.json file?' },
          {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: '{"path": "./package.json"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            tool_call_id: 'call_123',
            content:
              '{\n  "name": "kode-cli",\n  "version": "1.0.0",\n  "description": "AI-powered terminal assistant"\n}',
          },
        ],
        systemPrompt: ['You are a helpful assistant.'],
        tools: [
          {
            name: 'read_file',
            description: 'Read file contents from the filesystem',
            inputSchema: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'The path to the file to read',
                },
              },
              required: ['path'],
            },
          },
        ],
        maxTokens: 100,
        stream: true,
        reasoningEffort: 'high' as const,
        temperature: 1,
        verbosity: 'high' as const,
      }

      const request = adapter.createRequest(unifiedParams)

      const inputItems = getInputItems(request)
      const functionCallOutput = inputItems.find(
        item => isRecord(item) && item.type === 'function_call_output',
      )

      expect(functionCallOutput).toBeDefined()
      if (isRecord(functionCallOutput)) {
        expect(functionCallOutput.call_id).toBe('call_123')
        expect(functionCallOutput.output).toBeDefined()
      }

      const response = await callGPT5ResponsesAPI(ACTIVE_PROFILE, request)
      const unifiedResponse = await adapter.parseResponse(response)

      expect(unifiedResponse).toBeDefined()
      expectUnifiedUsage(unifiedResponse.usage)
    },
    { timeout: 15000 },
  )
})
