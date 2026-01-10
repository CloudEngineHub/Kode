import type { ImageBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

type AnthropicImageMediaType = Extract<
  ImageBlockParam['source'],
  { type: 'base64' }
>['media_type']

const ALLOWED_IMAGE_MEDIA_TYPES = new Set<AnthropicImageMediaType>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

export function coerceImageMediaType(value: string): AnthropicImageMediaType {
  return ALLOWED_IMAGE_MEDIA_TYPES.has(value as AnthropicImageMediaType)
    ? (value as AnthropicImageMediaType)
    : 'image/png'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

export function extractAssistantText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    const record = asRecord(block)
    if (!record || record.type !== 'text') continue
    parts.push(String(record.text ?? ''))
  }
  return parts.join('')
}
