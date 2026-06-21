type TextBlockLike = { type: 'text'; text: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    const record = asRecord(block)
    if (!record || record.type !== 'text') continue
    parts.push(String((record as TextBlockLike).text ?? ''))
  }
  return parts.join('\n')
}

export async function interpretHashCommand(input: string): Promise<string> {
  try {
    const { queryQuick } = await import('#core/ai/llm')

    const systemPrompt = [
      "You're helping the user structure notes that will be added to their AGENTS.md file.",
      "Format the user's input into a well-structured note that will be useful for later reference.",
      'Add appropriate markdown formatting, headings, bullet points, or other structural elements as needed.',
      'The goal is to transform the raw note into something that will be more useful when reviewed later.',
      'You should keep the original meaning but make the structure clear.',
    ]

    const result = await queryQuick({
      systemPrompt,
      userPrompt: `Transform this note for AGENTS.md: ${input}`,
    })

    const text = extractMessageText(result.message.content)
    if (text.trim()) return text
  } catch {
    // Fall through to minimal formatting.
  }

  return `# ${input}\n\n_Added on ${new Date().toLocaleString()}_`
}
