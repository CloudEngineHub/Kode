import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import { createUserMessage } from '#core/utils/messages'

export type GeneratedAgent = {
  identifier: string
  whenToUse: string
  systemPrompt: string
}

const DEFAULT_AGENT_GENERATION_SYSTEM_PROMPT = `You are an elite AI agent architect specializing in crafting high-performance agent configurations. Your expertise lies in translating user requirements into precisely-tuned agent specifications that maximize effectiveness and reliability.

**Important Context**: You may have access to project-specific instructions (AGENTS.md stack; legacy CLAUDE.md when present) and other context that may include coding standards, project structure, and custom requirements. Consider this context when creating agents to ensure they align with the project's established patterns and practices.

When a user describes what they want an agent to do, you will:

1. **Extract Core Intent**: Identify the fundamental purpose, key responsibilities, and success criteria for the agent. Look for both explicit requirements and implicit needs. Consider any project-specific context from AGENTS.md (and legacy CLAUDE.md when present). For agents that are meant to review code, you should assume that the user is asking to review recently written code and not the whole codebase, unless the user has explicitly instructed you otherwise.

2. **Design Expert Persona**: Create a compelling expert identity that embodies deep domain knowledge relevant to the task. The persona should inspire confidence and guide the agent's decision-making approach.

3. **Architect Comprehensive Instructions**: Develop a system prompt that:
   - Establishes clear behavioral boundaries and operational parameters
   - Provides specific methodologies and best practices for task execution
   - Anticipates edge cases and provides guidance for handling them
   - Incorporates any specific requirements or preferences mentioned by the user
   - Defines output format expectations when relevant
   - Aligns with project-specific coding standards and patterns from AGENTS.md (and legacy CLAUDE.md when present)

4. **Optimize for Performance**: Include:
   - Decision-making frameworks appropriate to the domain
   - Quality control mechanisms and self-verification steps
   - Efficient workflow patterns
   - Clear escalation or fallback strategies

5. **Create Identifier**: Design a concise, descriptive identifier that:
   - Uses lowercase letters, numbers, and hyphens only
   - Is typically 2-4 words joined by hyphens
   - Clearly indicates the agent's primary function
   - Is memorable and easy to type
   - Avoids generic terms like "helper" or "assistant"

6 **Example agent descriptions**:
  - in the 'whenToUse' field of the JSON object, you should include examples of when this agent should be used.
  - examples should be of the form:
    - <example>
      Context: The user is creating a test-runner agent that should be called after a logical chunk of code is written.
      user: "Please write a function that checks if a number is prime"
      assistant: "Here is the relevant function: "
      <function call omitted for brevity only for this example>
      <commentary>
      Since a significant piece of code was written, use the Task tool to launch the test-runner agent to run the tests.
      </commentary>
      assistant: "Now let me use the test-runner agent to run the tests"
    </example>
    - <example>
      Context: User is creating an agent to respond to the word "hello" with a friendly jok.
      user: "Hello"
      assistant: "I'm going to use the Task tool to launch the greeting-responder agent to respond with a friendly joke"
      <commentary>
      Since the user is greeting, use the greeting-responder agent to respond with a friendly joke. 
      </commentary>
    </example>
  - If the user mentioned or implied that the agent should be used proactively, you should include examples of this.
- NOTE: Ensure that in the examples, you are making the assistant use the Task tool and not simply respond directly to the task.

Your output must be a valid JSON object with exactly these fields:
{
  "identifier": "A unique, descriptive identifier using lowercase letters, numbers, and hyphens (e.g., 'test-runner', 'api-docs-writer', 'code-formatter')",
  "whenToUse": "A precise, actionable description starting with 'Use this agent when...' that clearly defines the triggering conditions and use cases. Ensure you include examples as described above.",
  "systemPrompt": "The complete system prompt that will govern the agent's behavior, written in second person ('You are...', 'You will...') and structured for maximum clarity and effectiveness"
}

Key principles for your system prompts:
- Be specific rather than generic - avoid vague instructions
- Include concrete examples when they would clarify behavior
- Balance comprehensiveness with clarity - every instruction should add value
- Ensure the agent has enough context to handle variations of the core task
- Make the agent proactive in seeking clarification when needed
- Build in quality assurance and self-correction mechanisms

Remember: The agents you create should be autonomous experts capable of handling their designated tasks with minimal additional guidance. Your system prompts are their complete operational manual.
`

export async function generateAgentWithModel(
  prompt: string,
  options?: { existingIdentifiers?: string[]; signal?: AbortSignal },
): Promise<GeneratedAgent> {
  const { queryModel } = await import('#core/ai/llm')

  const existing = (options?.existingIdentifiers ?? []).filter(Boolean)
  const existingClause =
    existing.length > 0
      ? `\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.join(', ')}`
      : ''

  const userPrompt = `Create an agent configuration based on this request: "${prompt}".${existingClause}\n  Return ONLY the JSON object, no other text.`

  try {
    const messages = [createUserMessage(userPrompt)]
    const response = await queryModel(
      'main',
      messages,
      [DEFAULT_AGENT_GENERATION_SYSTEM_PROMPT],
      options?.signal,
    )

    let responseText = ''
    const content = response.message?.content as unknown
    if (typeof content === 'string') {
      responseText = content
    } else if (Array.isArray(content)) {
      const asRecord = (value: unknown): Record<string, unknown> | null => {
        if (!value || typeof value !== 'object') return null
        return value as Record<string, unknown>
      }
      const textBlock = content.find(block => {
        const record = asRecord(block)
        return record?.type === 'text' && typeof record.text === 'string'
      })
      const record = asRecord(textBlock)
      responseText =
        record && typeof record.text === 'string' ? record.text : ''
    }

    if (!responseText) {
      throw new Error('No text content in model response')
    }

    const MAX_JSON_SIZE = 100_000 // 100KB
    const MAX_FIELD_LENGTH = 10_000

    if (responseText.length > MAX_JSON_SIZE) {
      throw new Error('Response too large')
    }

    let parsed: any
    try {
      parsed = JSON.parse(responseText.trim())
    } catch {
      const startIdx = responseText.indexOf('{')
      const endIdx = responseText.lastIndexOf('}')

      if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
        throw new Error('No valid JSON found in model response')
      }

      const jsonStr = responseText.substring(startIdx, endIdx + 1)
      if (jsonStr.length > MAX_JSON_SIZE) {
        throw new Error('JSON content too large')
      }

      try {
        parsed = JSON.parse(jsonStr)
      } catch (parseError) {
        throw new Error(
          `Invalid JSON format: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        )
      }
    }

    const identifier = String(parsed.identifier || '')
      .slice(0, 100)
      .trim()
    const whenToUse = String(parsed.whenToUse || '')
      .slice(0, MAX_FIELD_LENGTH)
      .trim()
    const agentSystemPrompt = String(parsed.systemPrompt || '')
      .slice(0, MAX_FIELD_LENGTH)
      .trim()

    if (!identifier || !whenToUse || !agentSystemPrompt) {
      throw new Error(
        'Invalid response structure: missing required fields (identifier, whenToUse, systemPrompt)',
      )
    }

    const sanitize = (str: string) => str.replace(/[\x00-\x1F\x7F-\x9F]/g, '')

    const cleanIdentifier = sanitize(identifier)
    if (!/^[a-z0-9-]+$/.test(cleanIdentifier)) {
      throw new Error(
        'Invalid identifier format: only lowercase letters, numbers, and hyphens allowed',
      )
    }

    return {
      identifier: cleanIdentifier,
      whenToUse: sanitize(whenToUse),
      systemPrompt: sanitize(agentSystemPrompt),
    }
  } catch (error) {
    logError(error)
    debugLogger.warn('AGENT_GENERATION_FAILED', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function generateAgentDraft(
  prompt: string,
  options?: { existingIdentifiers?: string[]; signal?: AbortSignal },
): Promise<GeneratedAgent> {
  return generateAgentWithModel(prompt, options)
}

export function validateAgentType(agentType: string): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (!agentType) {
    errors.push('Agent type is required')
    return { isValid: false, errors, warnings }
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$/.test(agentType)) {
    errors.push(
      'Agent type must start and end with alphanumeric characters and contain only letters, numbers, and hyphens',
    )
  }

  if (agentType.length < 3) {
    errors.push('Agent type must be at least 3 characters long')
  }

  if (agentType.length > 50) {
    errors.push('Agent type must be less than 50 characters')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

export type AgentDraftForValidation = {
  agentType?: string
  whenToUse?: string
  systemPrompt?: string
  selectedTools?: string[]
}

export function validateAgentConfig(config: AgentDraftForValidation): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (config.agentType) {
    const typeValidation = validateAgentType(config.agentType)
    errors.push(...typeValidation.errors)
    warnings.push(...typeValidation.warnings)
  }

  if (!config.whenToUse) {
    errors.push('Description (description) is required')
  } else if (config.whenToUse.length < 10) {
    warnings.push(
      'Description should be more descriptive (at least 10 characters)',
    )
  } else if (config.whenToUse.length > 5000) {
    warnings.push('Description is very long (over 5000 characters)')
  }

  if (!config.systemPrompt) {
    errors.push('System prompt is required')
  } else if (config.systemPrompt.length < 20) {
    errors.push('System prompt is too short (minimum 20 characters)')
  } else if (config.systemPrompt.length > 10_000) {
    warnings.push('System prompt is very long (over 10,000 characters)')
  }

  if (config.selectedTools === undefined) {
    warnings.push('Agent has access to all tools')
  } else if (config.selectedTools.length === 0) {
    warnings.push(
      'No tools selected - agent will have very limited capabilities',
    )
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  }
}

export function generateAgentFileContent(
  agentType: string,
  description: string,
  tools: string[] | '*',
  systemPrompt: string,
  model?: string,
  color?: string,
): string {
  // Quote + escape description and use literal "\n" sequences so the YAML frontmatter
  // stays one-line and parseable even when the description contains colons, quotes, or
  // backslashes.
  const escapedDescription = description
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\\\n')

  const toolsList =
    tools === '*'
      ? undefined
      : Array.isArray(tools) && tools.length === 1 && tools[0] === '*'
        ? undefined
        : Array.isArray(tools)
          ? tools
          : undefined

  const toolsLine =
    toolsList === undefined ? '' : `\ntools: ${toolsList.join(', ')}`
  const modelLine = model ? `\nmodel: ${model}` : ''
  const colorLine = color ? `\ncolor: ${color}` : ''

  return `---\nname: ${agentType}\ndescription: "${escapedDescription}"${toolsLine}${modelLine}${colorLine}\n---\n\n${systemPrompt}\n`
}
