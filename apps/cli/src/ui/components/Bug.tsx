import { Box, Text } from 'ink'
import * as React from 'react'
import { useState } from 'react'

import { GITHUB_ISSUES_REPO_URL } from '#core/constants/product'
import { MACRO } from '#core/constants/macros'
import { getGlobalConfig } from '#core/utils/config'
import { env } from '#core/utils/env'
import { openBrowser } from '#core/utils/browser'
import { getTheme } from '#core/utils/theme'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

import TextInput from './TextInput'

type Props = {
  onDone(result: string): void
}

type Step = 'userInput' | 'consent'

export function Bug({ onDone }: Props): React.ReactNode {
  const [step, setStep] = useState<Step>('userInput')
  const [cursorOffset, setCursorOffset] = useState(0)
  const [description, setDescription] = useState('')
  const textInputColumns = useTerminalSize().columns - 4

  const exitState = useExitOnCtrlCD(() => process.exit(0))

  const canContinue = description.trim().length > 0

  useKeypress((input, key) => {
    if (key.escape) {
      onDone('<bash-stderr>Bug report cancelled</bash-stderr>')
      return
    }

    if (step === 'consent' && (key.return || input === ' ')) {
      const issueUrl = createGitHubIssueUrl({
        title: (description.trim() || 'Bug Report').slice(0, 80),
        description: description.trim(),
      })
      void openBrowser(issueUrl)
      onDone('<bash-stdout>Opened GitHub issue</bash-stdout>')
    }
  })

  const theme = getTheme()

  return (
    <>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.permission}
        paddingX={1}
        paddingBottom={1}
        gap={1}
      >
        <Text bold color={theme.permission}>
          Submit Bug Report
        </Text>

        {step === 'userInput' ? (
          <Box flexDirection="column" gap={1}>
            <Text>
              Describe the issue below and include any errors you see:
            </Text>
            <TextInput
              value={description}
              onChange={setDescription}
              columns={textInputColumns}
              onSubmit={() => {
                if (canContinue) setStep('consent')
              }}
              onExitMessage={() =>
                onDone('<bash-stderr>Bug report cancelled</bash-stderr>')
              }
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
            />
            {!canContinue ? (
              <Text dimColor>Enter a description to continue</Text>
            ) : null}
          </Box>
        ) : (
          <Box flexDirection="column" gap={1}>
            <Text>This report will include:</Text>
            <Box marginLeft={2} flexDirection="column">
              <Text>
                - Your description: <Text dimColor>{description}</Text>
              </Text>
              <Text>
                - Environment: <Text dimColor>{env.platform}</Text>,{' '}
                <Text dimColor>{env.terminal}</Text>,{' '}
                <Text dimColor>v{MACRO.VERSION || 'unknown'}</Text>
              </Text>
              <Text>- Model settings (no API keys)</Text>
            </Box>
            <Text>
              Press <Text bold>Enter</Text> to open GitHub and create an issue.
            </Text>
          </Box>
        )}
      </Box>

      <Box marginLeft={3}>
        <Text dimColor>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : step === 'userInput' ? (
            <>Enter to continue · Esc to cancel</>
          ) : (
            <>Enter to open browser · Esc to cancel</>
          )}
        </Text>
      </Box>
    </>
  )
}

function createGitHubIssueUrl(args: {
  title: string
  description: string
}): string {
  const globalConfig = getGlobalConfig()
  const modelProfiles = globalConfig.modelProfiles || []
  const activeProfiles = modelProfiles.filter(p => p.isActive)

  let modelInfo = '## Models\\n'
  if (activeProfiles.length === 0) {
    modelInfo += '- No model profiles configured\\n'
  } else {
    for (const profile of activeProfiles) {
      modelInfo += `- ${profile.name}\\n`
      modelInfo += `    - provider: ${profile.provider}\\n`
      modelInfo += `    - model: ${profile.modelName}\\n`
      modelInfo += `    - baseURL: ${profile.baseURL}\\n`
      modelInfo += `    - maxTokens: ${profile.maxTokens}\\n`
      modelInfo += `    - contextLength: ${profile.contextLength}\\n`
      if (profile.reasoningEffort) {
        modelInfo += `    - reasoning effort: ${profile.reasoningEffort}\\n`
      }
    }
  }

  const body = encodeURIComponent(`
## Bug Description
${args.description}

## Environment Info
- Platform: ${env.platform}
- Terminal: ${env.terminal}
- Version: ${MACRO.VERSION || 'unknown'}

${modelInfo}`)

  return `${GITHUB_ISSUES_REPO_URL}/new?title=${encodeURIComponent(args.title)}&body=${body}&labels=user-reported,bug`
}
