/**
 * Core Provider Module
 *
 * Re-exports all core utilities for provider implementations.
 */

// Error types and utilities
export type { ProviderErrorCode, ProviderErrorDetails } from './errors'
export {
  ProviderError,
  RateLimitError,
  AuthenticationError,
  ContextLengthError,
  InvalidRequestError,
  ServerError,
  TimeoutError,
  NetworkError,
  ContentFilterError,
  ModelNotFoundError,
  QuotaExceededError,
  ServiceUnavailableError,
  ThinkingSignatureError,
  StreamError,
  ParseError,
  parseProviderError,
  isRetryableError,
  isRateLimitError,
  isAuthError,
  isContextLengthError,
  isContentFilterError,
} from './errors'

// Usage statistics and cost calculation
export type {
  UsageStatistics,
  CacheMetrics,
  CostBreakdown,
  RequestMetrics,
  ModelPricing,
} from './usage'
export {
  PROVIDER_PRICING,
  createEmptyUsage,
  calculateCost,
  normalizeAnthropicUsage,
  normalizeOpenAIUsage,
  normalizeGeminiUsage,
  normalizeDeepSeekUsage,
  aggregateUsage,
  formatUsageString,
} from './usage'

// Retry strategy
export type { RetryConfig, OnRetryCallback } from './retry'
export {
  DEFAULT_RETRY_CONFIG,
  AGGRESSIVE_RETRY_CONFIG,
  withRetry,
  withRetryAndTimeout,
  createRetryWrapper,
  shouldRetry,
  getRetryDelay,
} from './retry'

// Logging and debugging
export type {
  LogLevel,
  LogEntry,
  Logger,
  ProviderLogger,
  ProviderRequest,
  ProviderResponse,
  DebugConfig,
  AuditRecord,
  AuditFilter,
  AuditAggregation,
  AuditStore,
} from './logger'
export {
  DEFAULT_DEBUG_CONFIG,
  createConsoleLogger,
  createProviderLogger,
  redactSensitive,
  truncateContent,
  generateAuditId,
} from './logger'

// Fork point detection and resume
export type {
  ForkPoint,
  ValidationResult,
  ResumeHandler,
  SerializationOptions,
} from './fork'
export {
  findSafeForkPoints,
  getLastSafeForkPoint,
  serializeForResume,
  anthropicResumeHandler,
  deepseekResumeHandler,
  qwenResumeHandler,
  openaiChatResumeHandler,
  openaiResponsesResumeHandler,
  geminiResumeHandler,
  getResumeHandler,
  prepareMessagesForResume,
  validateMessagesForResume,
  canForkAt,
  forkAt,
} from './fork'
