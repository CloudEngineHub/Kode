export type BashLlmGateVerdict = {
  action: 'allow' | 'block'
  summary: string
}

export function parseVerdictFromText(text: string): BashLlmGateVerdict {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('LLM gate produced empty output')

  if (/^allow$/i.test(trimmed)) return { action: 'allow', summary: '' }
  if (/^block$/i.test(trimmed)) return { action: 'block', summary: '' }

  const finals = Array.from(
    trimmed.matchAll(/<final\b[^>]*>[\s\S]*?<\/final>/gi),
  )
  const xml = finals.length > 0 ? finals[finals.length - 1]![0]! : trimmed
  const decisionTag = xml.match(/<decision>\s*(allow|block)\s*<\/decision>/i)
  if (decisionTag) {
    const action = decisionTag[1]!.trim().toLowerCase() as 'allow' | 'block'
    const reasonTag = xml.match(/<reason>\s*([^<]{0,180})\s*<\/reason>/i)
    return { action, summary: (reasonTag?.[1] ?? '').trim() }
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
  for (let i = nonEmptyLines.length - 1; i >= 0; i--) {
    const line = nonEmptyLines[i]!
    const m = line.match(
      /^(?:[-*•]|\d+\.)?\s*(allow|block)\s*(?:(?:[:-]\s*)(.{0,200}))?\s*$/i,
    )
    if (!m) continue
    const action = m[1]!.toLowerCase() as 'allow' | 'block'
    const summary = (m[2] ?? '').trim().slice(0, 140)
    return { action, summary }
  }

  const bareDecisionTag = trimmed.match(
    /<decision>\s*(allow|block)\s*<\/decision>/i,
  )
  if (bareDecisionTag) {
    const action = bareDecisionTag[1]!.trim().toLowerCase() as 'allow' | 'block'
    const reasonTag = trimmed.match(/<reason>\s*([^<]{0,180})\s*<\/reason>/i)
    const summary = (reasonTag?.[1] ?? '').trim()
    return { action, summary }
  }

  const preview = trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed
  throw new Error(
    `Unable to parse LLM gate verdict. Output preview: ${preview}`,
  )
}

export function formatBashLlmGateBlockMessage(
  verdict: BashLlmGateVerdict,
): string {
  const summary = verdict.summary?.trim()
  return `Blocked by LLM intent gate: ${summary ? summary : 'No reason provided by gate model'}`
}
