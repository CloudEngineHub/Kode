import InkLink from 'ink-link'
import { Text } from 'ink'
import React from 'react'
import { env } from '#core/utils/env'

type LinkProps = {
  url: string
  children?: React.ReactNode
  fallback?: boolean
}

// Terminals that support hyperlinks
const LINK_SUPPORTING_TERMINALS = ['iTerm.app', 'WezTerm', 'Hyper', 'VSCode']

export function supportsHyperlinks(): boolean {
  return LINK_SUPPORTING_TERMINALS.includes(env.terminal ?? '')
}

export default function Link({
  url,
  children,
  fallback = true,
}: LinkProps): React.ReactNode {
  const supportsLinks = supportsHyperlinks()
  const displayContent = children || url

  if (supportsLinks) {
    // Terminal supports clickable links
    return (
      <InkLink url={url} fallback={false}>
        <Text>{displayContent}</Text>
      </InkLink>
    )
  } else if (fallback && children) {
    // Show fallback format: text (URL) when we have custom display text
    return (
      <InkLink url={url} fallback={true}>
        <Text>{displayContent}</Text>
      </InkLink>
    )
  } else {
    // Just show the content without link wrapper
    return <Text>{displayContent}</Text>
  }
}
