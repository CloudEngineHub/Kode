export interface ConnectionTestResult {
  success: boolean
  message: string
  endpoint?: string
  details?: string
  apiUsed?: 'responses' | 'chat_completions'
  responseTime?: number
}

export interface GPT5TestConfig {
  model: string
  apiKey: string
  baseURL?: string
  maxTokens?: number
  provider?: string
}
