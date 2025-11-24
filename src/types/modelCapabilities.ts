// Model capability type definitions for unified API support
export interface ModelCapabilities {
  // API architecture type
  apiArchitecture: {
    primary: 'chat_completions' | 'responses_api'
    fallback?: 'chat_completions'  // Responses API models can fallback
  }
  
  // Parameter mapping
  parameters: {
    maxTokensField: 'max_tokens' | 'max_completion_tokens' | 'max_output_tokens'
    supportsReasoningEffort: boolean
    supportsVerbosity: boolean
    temperatureMode: 'flexible' | 'fixed_one' | 'restricted'
  }
  
  // Tool calling capabilities
  toolCalling: {
    mode: 'none' | 'function_calling' | 'custom_tools'
    supportsFreeform: boolean
    supportsAllowedTools: boolean
    supportsParallelCalls: boolean
  }
  
  // State management
  stateManagement: {
    supportsResponseId: boolean
    supportsConversationChaining: boolean
    supportsPreviousResponseId: boolean
  }
  
  // Streaming support
  streaming: {
    supported: boolean
    includesUsage: boolean
  }
}

// Unified request parameters
export interface UnifiedRequestParams {
  messages: any[]
  systemPrompt: string[]
  tools?: any[]
  maxTokens: number
  stream?: boolean
  previousResponseId?: string
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  verbosity?: 'low' | 'medium' | 'high'
  temperature?: number
  allowedTools?: string[]
}

// Unified response format
export interface UnifiedResponse {
  id: string
  content: string | Array<{ type: string; text?: string; [key: string]: any }>
  toolCalls?: any[]
  usage: {
    promptTokens: number
    completionTokens: number
    reasoningTokens?: number
  }
  responseId?: string  // For Responses API state management
}