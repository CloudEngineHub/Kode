import type { DocumentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { addLineNumbers } from '#core/utils/file'
import type { FileReadToolData } from './types'

export function renderResultForAssistant(data: FileReadToolData) {
  switch (data.type) {
    case 'image':
      return [
        {
          type: 'image',
          source: {
            type: 'base64',
            data: data.file.base64,
            media_type: data.file.type,
          },
        },
      ]
    case 'pdf':
      return [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: data.file.base64,
          },
        } satisfies DocumentBlockParam,
      ]
    case 'notebook':
      return JSON.stringify(data.file, null, 2)
    case 'text':
      return addLineNumbers({
        content: data.file.content,
        startLine: data.file.startLine,
      })
  }
}
