import type {
  MessageParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { PROMPT_CACHING_ENABLED } from '#core/ai/llm/systemPromptUtils'

/**
 * Manage cache control to ensure it doesn't exceed the provider's 4 cache block limit
 * Priority:
 * 1. System prompts (high priority)
 * 2. Long documents or reference materials (high priority)
 * 3. Reusable context (medium priority)
 * 4. Short messages or one-time content (no caching)
 */
export function applyCacheControlWithLimits(
  systemBlocks: TextBlockParam[],
  messageParams: MessageParam[],
): { systemBlocks: TextBlockParam[]; messageParams: MessageParam[] } {
  if (!PROMPT_CACHING_ENABLED) {
    return { systemBlocks, messageParams }
  }

  const maxCacheBlocks = 4
  let usedCacheBlocks = 0

  // 1. Prioritize adding cache to system prompts (highest priority)
  const processedSystemBlocks = systemBlocks.map(block => {
    if (usedCacheBlocks < maxCacheBlocks && block.text.length > 1000) {
      usedCacheBlocks++
      return {
        ...block,
        cache_control: { type: 'ephemeral' as const },
      }
    }
    const { cache_control, ...blockWithoutCache } = block
    return blockWithoutCache
  })

  // 2. Add cache to message content based on priority
  const processedMessageParams = messageParams.map((message, messageIndex) => {
    if (Array.isArray(message.content)) {
      const processedContent = message.content.map(
        (contentBlock, blockIndex) => {
          // Determine whether this content block should be cached
          const shouldCache =
            usedCacheBlocks < maxCacheBlocks &&
            contentBlock.type === 'text' &&
            typeof contentBlock.text === 'string' &&
            // Long documents (over 2000 characters)
            (contentBlock.text.length > 2000 ||
              // Last content block of the last message (may be important context)
              (messageIndex === messageParams.length - 1 &&
                blockIndex === message.content.length - 1 &&
                contentBlock.text.length > 500))

          if (shouldCache) {
            usedCacheBlocks++
            return {
              ...contentBlock,
              cache_control: { type: 'ephemeral' as const },
            }
          }

          // Remove existing cache_control
          if ('cache_control' in contentBlock) {
            return { ...contentBlock, cache_control: undefined }
          }
          return contentBlock
        },
      )

      return {
        ...message,
        content: processedContent,
      }
    }

    return message
  })

  return {
    systemBlocks: processedSystemBlocks,
    messageParams: processedMessageParams,
  }
}
