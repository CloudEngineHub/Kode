import { Box, Text } from 'ink'
import React from 'react'
import { Select } from './CustomSelect/select'
import { getTheme } from '#core/utils/theme'
import Link from './Link'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'

interface Props {
  onDone: () => void
}

export function CostThresholdDialog({ onDone }: Props): React.ReactNode {
  const layout = useScreenLayout()

  // Handle Ctrl+C, Ctrl+D and Esc
  useKeypress((input, key) => {
    if ((key.ctrl && (input === 'c' || input === 'd')) || key.escape) {
      onDone()
    }
  })

  return (
    <Box marginTop={1} width="100%">
      <ScreenFrame
        title="Usage cost notice"
        paddingX={layout.paddingX}
        paddingY={layout.tightLayout ? 0 : layout.paddingY}
        gap={layout.gap}
      >
        <Box flexDirection="column" gap={layout.gap}>
          <Box flexDirection="column">
            <Text bold>
              You&apos;ve spent $5 on AI model API calls this session.
            </Text>
            <Text dimColor>
              Learn more about monitoring your AI usage costs:
            </Text>
            <Link url="https://github.com/shareAI-lab/kode/blob/main/README.md" />
          </Box>
          <Box>
            <Select
              options={[
                {
                  value: 'ok',
                  label: 'Got it, thanks!',
                },
              ]}
              onChange={onDone}
            />
          </Box>
          <Text dimColor wrap="truncate-end">
            Esc to close
          </Text>
        </Box>
      </ScreenFrame>
    </Box>
  )
}
