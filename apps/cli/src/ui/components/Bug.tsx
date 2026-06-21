import { Box, Text } from 'ink'
import * as React from 'react'
import { useState } from 'react'

import { GITHUB_ISSUES_REPO_URL } from '#core/constants/product'
import { MACRO } from '#core/constants/macros'
import { getGlobalConfig } from '#core/utils/config'
import { env } from '#core/utils/env'
import { openBrowser } from '#core/utils/browser'
import { getTheme } from '#core/utils/theme'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'

import TextInput from './TextInput'

type Props = {
  onDone(result: string): void
}

type Step = 'userInput' | 'consent'

export function Bug({ onDone }: Props): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const [step, setStep] = useState<Step>('userInput')
  const [cursorOffset, setCursorOffset] = useState(0)
  const [description, setDescription] = useState('')
  const textInputColumns = Math.max(
    10,
    layout.columns - layout.paddingX * 2 - 10,
  )

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

  return (
    <ScreenFrame
      title="Submit Bug Report"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        {step === 'userInput' ? (
          <Box flexDirection="column" gap={layout.gap}>
            <Text wrap="truncate-end">
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
              <Text dimColor wrap="truncate-end">
                Enter a description to continue
              </Text>
            ) : null}
          </Box>
        ) : (
          <Box flexDirection="column" gap={layout.gap}>
            <Text wrap="truncate-end">This report will include:</Text>
            <Box paddingLeft={2} flexDirection="column">
              <Text wrap="truncate-end">
                - Your description: <Text dimColor>{description}</Text>
              </Text>
              <Text wrap="truncate-end">
                - Environment: <Text dimColor>{env.platform}</Text>,{' '}
                <Text dimColor>{env.terminal}</Text>,{' '}
                <Text dimColor>v{MACRO.VERSION || 'unknown'}</Text>
              </Text>
              <Text wrap="truncate-end">- Model settings (no API keys)</Text>
            </Box>
            <Text wrap="truncate-end">
              Press <Text bold>Enter</Text> to open GitHub and create an issue.
            </Text>
          </Box>
        )}

        <Box marginTop={layout.tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {exitState.pending
              ? `Press ${exitState.keyName} again to exit`
              : step === 'userInput'
                ? 'Enter to continue · Esc to cancel'
                : 'Enter to open browser · Esc to cancel'}
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
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
