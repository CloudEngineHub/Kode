import type { ImageBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

export type AnthropicImageMediaType = Extract<
  ImageBlockParam['source'],
  { type: 'base64' }
>['media_type']

export type FileReadToolData =
  | {
      type: 'text'
      file: {
        filePath: string
        content: string
        numLines: number
        startLine: number
        totalLines: number
      }
    }
  | {
      type: 'image'
      file: {
        base64: string
        type: AnthropicImageMediaType
        originalSize: number
        dimensions?: {
          originalWidth?: number
          originalHeight?: number
          displayWidth?: number
          displayHeight?: number
        }
      }
    }
  | { type: 'notebook'; file: { filePath: string; cells: unknown[] } }
  | {
      type: 'pdf'
      file: { filePath: string; base64: string; originalSize: number }
    }
