import { useEffect, useState } from 'react'

import { getActiveAgents, type AgentConfig } from '#core/utils/agentLoader'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'
import type { UnifiedSuggestion } from '#cli-utils/completion/types'

function findSmartBreak(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text

  const sentenceEndings = /[.!。！]/
  const firstSentenceMatch = text.search(sentenceEndings)
  if (firstSentenceMatch !== -1) {
    const firstSentence = text.slice(0, firstSentenceMatch).trim()
    if (firstSentence.length >= 5) return firstSentence
  }

  const commaEndings = /[,，]/g
  const commas: number[] = []
  let match: RegExpExecArray | null
  while ((match = commaEndings.exec(text)) !== null) {
    commas.push(match.index)
  }

  for (let i = commas.length - 1; i >= 0; i--) {
    const commaPos = commas[i]
    if (commaPos < maxLength) {
      const clause = text.slice(0, commaPos).trim()
      if (clause.length >= 5) return clause
    }
  }

  return text.slice(0, maxLength) + '...'
}

function compactWhenToUse(whenToUse: string): string {
  let shortDesc = whenToUse

  const prefixPatterns = [
    /^Use this agent when you need (assistance with: )?/i,
    /^Use PROACTIVELY (when|to) /i,
    /^Specialized in /i,
    /^Implementation specialist for /i,
    /^Design validation specialist\.? Use PROACTIVELY to /i,
    /^Task validation specialist\.? Use PROACTIVELY to /i,
    /^Requirements validation specialist\.? Use PROACTIVELY to /i,
  ]

  for (const pattern of prefixPatterns) {
    shortDesc = shortDesc.replace(pattern, '')
  }

  shortDesc = findSmartBreak(shortDesc.trim(), 80)

  if (!shortDesc || shortDesc.length < 5) {
    shortDesc = findSmartBreak(whenToUse, 80)
  }

  return shortDesc
}

export function useAgentSuggestions(): UnifiedSuggestion[] {
  const [agentSuggestions, setAgentSuggestions] = useState<UnifiedSuggestion[]>(
    [],
  )

  useEffect(() => {
    getActiveAgents()
      .then((agents: AgentConfig[]) => {
        const suggestions: UnifiedSuggestion[] = agents.map(config => ({
          value: `run-agent-${config.agentType}`,
          displayValue: `👤 run-agent-${config.agentType} :: ${compactWhenToUse(
            config.whenToUse,
          )}`,
          type: 'agent',
          score: 85,
          metadata: config,
        }))
        setAgentSuggestions(suggestions)
      })
      .catch(error => {
        logError(error)
        debugLogger.warn('UNIFIED_COMPLETION_AGENTS_LOAD_FAILED', {
          error: error instanceof Error ? error.message : String(error),
        })
        setAgentSuggestions([])
      })
  }, [])

  return agentSuggestions
}
