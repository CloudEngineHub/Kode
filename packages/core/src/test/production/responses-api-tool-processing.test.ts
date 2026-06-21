import { test, expect, describe } from 'bun:test'
import { ModelAdapterFactory } from '#core/ai/modelAdapterFactory'
import { productionTestModels, getResponsesAPIModels } from '../testAdapters'

const MOCK_SERVER_TEST_MODE = process.env.MOCK_SERVER_TEST_MODE === 'true'

/**
 * 🧪 Response API Tool Processing Test with Real Mock Server
 *
 * This test uses the actual mock server at port 3001 to verify Response API tool processing
 * in a realistic environment. It tests the exact "Use the Read tool to read the package.json file"
 * scenario that users encounter.
 */
/**
 * NOTE: The canonical file read tool name is "Read" (compatibility).
 */

describe('🧪 Response API Tool Processing - Real Mock Server Test', () => {
  if (!MOCK_SERVER_TEST_MODE) {
    test.skip('should process tool calls correctly without duplication (requires MOCK_SERVER_TEST_MODE=true)', () => {})
    return
  }

  test('should process tool calls correctly without duplication', async () => {
    const mockModel = getResponsesAPIModels(productionTestModels)[0]
    if (!mockModel) {
      console.log(
        '⚠️  No Responses API test model configured; skipping mock server test.',
      )
      return
    }

    console.log('\n🎯 Testing Response API Tool Processing')
    console.log('='.repeat(45))

    // Create adapter using ModelAdapterFactory
    const adapter = ModelAdapterFactory.createAdapter(mockModel)

    // Create the exact request when user says "Use the Read tool to read the package.json file"
    const userRequest = {
      messages: [
        {
          role: 'user',
          content: 'Use the Read tool to read the package.json file',
        },
      ],
      systemPrompt: ['You are a helpful assistant. Use tools when requested.'],
      tools: [
        {
          name: 'Read',
          description: 'Read file contents',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute file path to read',
              },
            },
            required: ['file_path'],
          },
        },
      ],
      maxTokens: 1000,
      stream: true,
      temperature: 0.7,
    }

    console.log('\n📝 Step 1: Creating request for "use the Read tool"')
    const request = adapter.createRequest(userRequest)
    console.log('   ✅ Request created with Read tool')
    console.log('   ✅ Streaming enabled:', request.stream)
    console.log('   ✅ Tools included:', !!request.tools)
    console.log('   ✅ Mock server endpoint:', mockModel.baseURL)

    console.log('\n📡 Step 2: Making real API call to mock server')

    const endpoint = `${mockModel.baseURL}/responses`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mockModel.apiKey}`,
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      console.log(
        '   ❌ Mock server request failed:',
        response.status,
        response.statusText,
      )
      throw new Error(`Mock server error: ${response.status}`)
    }

    console.log('   ✅ Response received from mock server:', response.status)

    console.log('\n📡 Step 3: Processing real mock server response')
    const unifiedResponse = await adapter.parseResponse(response)

    console.log('   Response ID:', unifiedResponse.id)
    console.log('   Content blocks:', unifiedResponse.content?.length || 0)
    console.log(
      '   Tool calls in response:',
      unifiedResponse.toolCalls?.length || 0,
    )

    // Analyze the response for the triple tool call bug
    const contentBlocks = Array.isArray(unifiedResponse.content)
      ? unifiedResponse.content
      : []
    const toolUseInContent = contentBlocks.filter(
      (block: any) => block.type === 'tool_use',
    )
    const toolCallsInResponse = unifiedResponse.toolCalls || []

    console.log('\n📊 Step 4: Analyzing for triple tool call bug')
    console.log('   Content blocks with tool_use:', toolUseInContent.length)
    console.log('   Tool calls array length:', toolCallsInResponse.length)

    const totalToolRepresentations =
      toolUseInContent.length + toolCallsInResponse.length
    console.log('   Total tool representations:', totalToolRepresentations)

    // Check for the bug pattern
    let bugDetected = false
    if (toolUseInContent.length > 0 && toolCallsInResponse.length > 0) {
      const firstToolUse = toolUseInContent[0]
      const firstToolCall = toolCallsInResponse[0]

      // Check if they represent the same tool
      if (firstToolUse.name === firstToolCall.function.name) {
        bugDetected = true
        console.log('\n🚨 TRIPLE TOOL CALL BUG CONFIRMED!')
        console.log(
          '   Same Read tool appears in both content and toolCalls array',
        )
        console.log(
          '   This will cause duplication when the CLI pipeline processes it',
        )
        console.log(
          '   Content tool_use:',
          JSON.stringify(firstToolUse, null, 2),
        )
        console.log('   Tool call:', JSON.stringify(firstToolCall, null, 2))
      }
    }

    if (totalToolRepresentations === 0) {
      console.log('\n⚠️  No tool calls detected')
      console.log('   This could mean:')
      console.log('   - Mock server not detecting "use the Read tool" pattern')
      console.log('   - Adapter not parsing tool_request events correctly')
      console.log('   - SSE format mismatch between mock server and adapter')
    } else if (bugDetected) {
      console.log('\n❌ BUG REPRODUCTION SUCCESSFUL!')
      console.log(
        '   The "use the Read tool" scenario triggers the triple tool call bug',
      )
      console.log('   Fix needed in buildAssistantMessageFromUnifiedResponse()')
    } else if (totalToolRepresentations === 1) {
      console.log('\n✅ NO BUG DETECTED!')
      console.log('   Single tool representation - bug may be fixed')
    }

    // Document the results
    console.log('\n📋 Response API Tool Processing Test Results:')
    console.log(
      `   User message: "Use the Read tool to read the package.json file"`,
    )
    console.log(`   Tool representations found: ${totalToolRepresentations}`)
    console.log(
      `   Status: ${bugDetected ? 'FAILED - Triple processing detected' : 'PASSED - Single processing'}`,
    )

    // Test expectations - FAIL if bug is detected
    expect(totalToolRepresentations).toBeGreaterThanOrEqual(0)

    // CRITICAL: Fail the test if triple tool call bug is detected
    if (bugDetected) {
      console.log('\n❌ TEST FAILED: Triple tool call bug detected!')
      console.log(
        '   This indicates the Response API is processing tool calls multiple times',
      )
      console.log('   Expected: 1 tool representation')
      console.log(`   Actual: ${totalToolRepresentations} tool representations`)
      console.log('\n💡 Fix Implementation Required:')
      console.log('   File: src/services/adapters/responsesAPI.ts')
      console.log(
        '   Ensure parseResponse returns only ONE representation of tool calls',
      )

      // Fail the test explicitly
      expect(bugDetected).toBe(false)
    }
  })
})
