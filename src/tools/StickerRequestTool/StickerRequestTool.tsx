import { z } from 'zod'
import React from 'react'
import { Text } from 'ink'
import { Tool, ToolUseContext, ExtendedToolUseContext } from '../../Tool'
import { DESCRIPTION, PROMPT } from './prompt'
import {
  StickerRequestForm,
  FormData,
} from '../../components/StickerRequestForm'
// Telemetry and gates removed
import { getTheme } from '../../utils/theme'

const stickerRequestSchema = z.object({
  trigger: z.string(),
})

export const StickerRequestTool: Tool = {
  name: 'StickerRequest',
  userFacingName: () => 'Stickers',
  description: async () => DESCRIPTION,
  inputSchema: stickerRequestSchema,
  isEnabled: async () => false,
  isReadOnly: () => false,
  isConcurrencySafe: () => false, // StickerRequestTool modifies state, not safe for concurrent execution
  needsPermissions: () => false,
  prompt: async () => PROMPT,

  async *call(_, context: ToolUseContext) {
    

    // Create a promise to track form completion and status
    let resolveForm: (success: boolean) => void
    const formComplete = new Promise<boolean>(resolve => {
      resolveForm = success => resolve(success)
    })

    // Check if setToolJSX is available (cast context if needed)
    const extendedContext = context as ExtendedToolUseContext
    if (extendedContext.setToolJSX) {
      extendedContext.setToolJSX({
        jsx: (
        <StickerRequestForm
          onSubmit={(formData: FormData) => {
            
            resolveForm(true)
            if (extendedContext.setToolJSX) {
              extendedContext.setToolJSX(null) // Clear the JSX
            }
          }}
          onClose={() => {
            
            resolveForm(false)
            if (extendedContext.setToolJSX) {
              extendedContext.setToolJSX(null) // Clear the JSX
            }
          }}
        />
        ),
        shouldHidePromptInput: true,
      })
    } else {
      // Fallback if setToolJSX is not available
      console.log('Sticker form would be displayed here, but setToolJSX is not available')
      resolveForm(false)
    }

    // Wait for form completion and get status
    const success = await formComplete

    if (!success) {
      context.abortController.abort()
      throw new Error('Sticker request cancelled')
    }

    // Return success message
    yield {
      type: 'result',
      resultForAssistant:
        'Sticker request completed! Please tell the user that they will receive stickers in the mail if they have submitted the form!',
      data: { success },
    }
  },

  renderToolUseMessage(_input) {
    return ''
  },

  renderToolUseRejectedMessage() {
    return (
      <Text>
        &nbsp;&nbsp;⎿ &nbsp;
        <Text color={getTheme().error}>No (Sticker request cancelled)</Text>
      </Text>
    )
  },

  renderResultForAssistant: (content: string) => content,
}
