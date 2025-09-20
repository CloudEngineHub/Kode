import { ModelAdapterFactory } from '@services/modelAdapterFactory'
import { getModelCapabilities } from '@constants/modelCapabilities'
import { ModelProfile } from '@utils/config'

// Test different models' adapter selection
const testModels: ModelProfile[] = [
  {
    name: 'GPT-5 Test',
    modelName: 'gpt-5',
    provider: 'openai',
    apiKey: 'test-key',
    maxTokens: 8192,
    contextLength: 128000,
    reasoningEffort: 'medium',
    isActive: true,
    createdAt: Date.now()
  },
  {
    name: 'GPT-4o Test',
    modelName: 'gpt-4o',
    provider: 'openai',
    apiKey: 'test-key',
    maxTokens: 4096,
    contextLength: 128000,
    isActive: true,
    createdAt: Date.now()
  },
  {
    name: 'Claude Test',
    modelName: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    apiKey: 'test-key',
    maxTokens: 4096,
    contextLength: 200000,
    isActive: true,
    createdAt: Date.now()
  },
  {
    name: 'O1 Test',
    modelName: 'o1',
    provider: 'openai',
    apiKey: 'test-key',
    maxTokens: 4096,
    contextLength: 128000,
    isActive: true,
    createdAt: Date.now()
  },
  {
    name: 'GLM-5 Test',
    modelName: 'glm-5',
    provider: 'custom',
    apiKey: 'test-key',
    maxTokens: 8192,
    contextLength: 128000,
    baseURL: 'https://api.glm.ai/v1',
    isActive: true,
    createdAt: Date.now()
  }
]

console.log('🧪 Testing Model Adapter System\n')
console.log('=' .repeat(60))

testModels.forEach(model => {
  console.log(`\n📊 Testing: ${model.name} (${model.modelName})`)
  console.log('-'.repeat(40))
  
  // Get capabilities
  const capabilities = getModelCapabilities(model.modelName)
  console.log(`  ✓ API Architecture: ${capabilities.apiArchitecture.primary}`)
  console.log(`  ✓ Fallback: ${capabilities.apiArchitecture.fallback || 'none'}`)
  console.log(`  ✓ Max Tokens Field: ${capabilities.parameters.maxTokensField}`)
  console.log(`  ✓ Tool Calling Mode: ${capabilities.toolCalling.mode}`)
  console.log(`  ✓ Supports Freeform: ${capabilities.toolCalling.supportsFreeform}`)
  console.log(`  ✓ Supports Streaming: ${capabilities.streaming.supported}`)
  
  // Test adapter creation
  const adapter = ModelAdapterFactory.createAdapter(model)
  console.log(`  ✓ Adapter Type: ${adapter.constructor.name}`)
  
  // Test shouldUseResponsesAPI
  const shouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(model)
  console.log(`  ✓ Should Use Responses API: ${shouldUseResponses}`)
  
  // Test with custom endpoint
  if (model.baseURL) {
    const customModel = { ...model, baseURL: 'https://custom.api.com/v1' }
    const customShouldUseResponses = ModelAdapterFactory.shouldUseResponsesAPI(customModel)
    console.log(`  ✓ With Custom Endpoint: ${customShouldUseResponses ? 'Responses API' : 'Chat Completions'}`)
  }
})

console.log('\n' + '='.repeat(60))
console.log('✅ Adapter System Test Complete!')
console.log('\nTo enable the new system, set USE_NEW_ADAPTERS=true')
console.log('To use legacy system, set USE_NEW_ADAPTERS=false')