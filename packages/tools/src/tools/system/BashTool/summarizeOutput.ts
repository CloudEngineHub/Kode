import { createHash, randomUUID } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'

import type { AssistantMessage, UserMessage } from '#core/query'
import { queryLLM } from '#core/ai/llmLazy'
import { getKodeBaseDir } from '#core/utils/env'
import { extractTag } from '#core/utils/messages'

const SUMMARY_THRESHOLD_CHARS = 5000 // Reference CLI: W97=5000
const OUTPUT_DIR_NAME = 'bash-outputs' // Reference CLI: V97="bash-outputs"

const SUMMARY_SYSTEM_PROMPT = `You are analyzing output from a bash command to determine if it should be summarized.

Your task is to:
1. Determine if the output contains mostly repetitive logs, verbose build output, or other "log spew"
2. If it does, extract only the relevant information (errors, test results, completion status, etc.)
3. Consider the conversation context - if the user specifically asked to see detailed output, preserve it

You MUST output your response using XML tags in the following format:
<should_summarize>true/false</should_summarize>
<reason>reason for why you decided to summarize or not summarize the output</reason>
<summary>markdown summary as described below (only if should_summarize is true)</summary>

If should_summarize is true, include all three tags with a comprehensive summary.
If should_summarize is false, include only the first two tags and omit the summary tag.

Summary: The summary should be extremely comprehensive and detailed in markdown format. Especially consider the converstion context to determine what to focus on.
Freely copy parts of the output verbatim into the summary if you think it is relevant to the conversation context or what the user is asking for.
It's fine if the summary is verbose. The summary should contain the following sections: (Make sure to include all of these sections)
1. Overview: An overview of the output including the most interesting information summarized.
2. Detailed summary: An extremely detailed summary of the output.
3. Errors: List of relevant errors that were encountered. Include snippets of the output wherever possible.
4. Verbatim output: Copy any parts of the provided output verbatim that are relevant to the conversation context. This is critical. Make sure to include ATLEAST 3 snippets of the output verbatim. 
5. DO NOT provide a recommendation. Just summarize the facts.

Reason: If providing a reason, it should comprehensively explain why you decided not to summarize the output.

Examples of when to summarize:
- Verbose build logs with only the final status being important. Eg. if we are running npm run build to test if our code changes build.
- Test output where only the pass/fail results matter
- Repetitive debug logs with a few key errors

Examples of when NOT to summarize:
- User explicitly asked to see the full output
- Output contains unique, non-repetitive information
- Error messages that need full stack traces for debugging


CRITICAL: You MUST start your response with the <should_summarize> tag as the very first thing. Do not include any other text before the first tag. The summary tag can contain markdown format, but ensure all XML tags are properly closed.`

function buildSummaryUserPrompt(args: {
  command: string
  output: string
  recentConversationContextJson?: string | null
}): string {
  return `Command executed: \`${args.command}\`

Recent conversation context:
${args.recentConversationContextJson || 'No recent conversation context'}

Bash output to analyze:
${args.output}

Should this output be summarized? If yes, provide a summary focusing on the most relevant information.`
}

function buildBashOutputFilename(command: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const hash = createHash('sha256').update(command).digest('hex').slice(0, 8)
  return `${timestamp}-${hash}.txt`
}

function formatPersistedBashOutput(args: {
  command: string
  stdout: string
  stderr: string
}): string {
  return `COMMAND: ${args.command}

STDOUT:
${args.stdout}

STDERR:
${args.stderr}`
}

function persistBashOutput(args: {
  conversationKey: string
  command: string
  stdout: string
  stderr: string
}): string {
  const dir = path.join(getKodeBaseDir(), OUTPUT_DIR_NAME, args.conversationKey)
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    return ''
  }

  const filename = buildBashOutputFilename(args.command)
  const filePath = path.join(dir, filename)

  try {
    writeFileSync(
      filePath,
      formatPersistedBashOutput({
        command: args.command,
        stdout: args.stdout,
        stderr: args.stderr,
      }),
      { encoding: 'utf-8' },
    )
    return filePath
  } catch {
    return ''
  }
}

function wrapSummarizedOutput(summary: string, rawOutputPath: string): string {
  const note = rawOutputPath
    ? `\n\nNote: The complete bash output is available at ${rawOutputPath}. You can use Read or Grep tools to search for specific information not included in this summary.`
    : ''
  return `[Summarized output]
${summary}${note}`
}

function extractTextFromAssistantMessage(message: AssistantMessage): string {
  const content = message.message.content
  if (!Array.isArray(content)) return ''
  return content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

export async function maybeSummarizeBashOutput(args: {
  command: string
  stdout: string
  stderr: string
  outputForAnalysis: string
  conversationKey: string
  signal: AbortSignal
}): Promise<{ summary: string; rawOutputPath: string } | null> {
  if (process.env.NODE_ENV === 'test') return null
  if (args.outputForAnalysis.length < SUMMARY_THRESHOLD_CHARS) return null

  const messages = [
    {
      type: 'user',
      uuid: randomUUID(),
      message: {
        role: 'user',
        content: buildSummaryUserPrompt({
          command: args.command,
          output: args.outputForAnalysis,
          recentConversationContextJson: null,
        }),
      },
    },
  ] as (UserMessage | AssistantMessage)[]

  let response: AssistantMessage
  try {
    response = await queryLLM(
      messages,
      [SUMMARY_SYSTEM_PROMPT],
      0,
      [],
      args.signal,
      {
        safeMode: false,
        model: 'main',
        prependCLISysprompt: false,
        temperature: 0,
        maxTokens: 4096,
      },
    )
  } catch {
    return null
  }

  const text = extractTextFromAssistantMessage(response)
  const shouldSummarize = extractTag(text, 'should_summarize')?.trim()
  const summary = extractTag(text, 'summary')?.trim() || ''

  if (shouldSummarize !== 'true' || !summary) return null

  const rawOutputPath = persistBashOutput({
    conversationKey: args.conversationKey,
    command: args.command,
    stdout: args.stdout,
    stderr: args.stderr,
  })

  return {
    summary: wrapSummarizedOutput(summary, rawOutputPath),
    rawOutputPath,
  }
}
