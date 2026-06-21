import { randomBytes } from 'node:crypto'

import {
  PLAN_SLUG_ADJECTIVES,
  PLAN_SLUG_NOUNS,
  PLAN_SLUG_VERBS,
} from '../planSlugWords'

const slugBySessionId = new Map<string, string>()

function pickIndex(length: number): number {
  return randomBytes(4).readUInt32BE(0) % length
}

function pickWord(words: readonly string[]): string {
  return words[pickIndex(words.length)]!
}

function generateSessionSlug(): string {
  const adjective = pickWord(PLAN_SLUG_ADJECTIVES)
  const verb = pickWord(PLAN_SLUG_VERBS)
  const noun = pickWord(PLAN_SLUG_NOUNS)
  return `${adjective}-${verb}-${noun}`
}

export function getOrCreateSessionSlug(sessionId: string): string {
  const existing = slugBySessionId.get(sessionId)
  if (existing) return existing
  const slug = generateSessionSlug()
  slugBySessionId.set(sessionId, slug)
  return slug
}

export function setSessionSlug(sessionId: string, slug: string): void {
  slugBySessionId.set(sessionId, slug)
}

export function clearSessionSlugCache(): void {
  slugBySessionId.clear()
}
