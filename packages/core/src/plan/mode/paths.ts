import { existsSync, mkdirSync, readFileSync, realpathSync } from 'fs'
import { isAbsolute, join, relative, resolve, parse } from 'path'
import {
  generateSlug,
  getPlanSlugForConversationKey,
  setPlanSlug,
} from './slug'
import { getActivePlanConversationKey, DEFAULT_CONVERSATION_KEY } from './state'
import { getKodeBaseDir } from '#core/utils/env'

const MAX_SLUG_ATTEMPTS = 10

export function getPlanDirectory(): string {
  const dir = join(getKodeBaseDir(), 'plans')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getOrCreatePlanSlug(conversationKey: string): string {
  const existing = getPlanSlugForConversationKey(conversationKey)
  if (existing) return existing

  const dir = getPlanDirectory()

  let slug: string | null = null
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    slug = generateSlug()
    const path = join(dir, `${slug}.md`)
    if (!existsSync(path)) break
  }

  if (!slug) slug = generateSlug()

  setPlanSlug(conversationKey, slug)
  return slug
}

export function getPlanFilePath(
  agentId?: string,
  conversationKey?: string,
): string {
  const dir = getPlanDirectory()
  const key = conversationKey ?? DEFAULT_CONVERSATION_KEY
  const slug = getOrCreatePlanSlug(key)

  if (!agentId) return join(dir, `${slug}.md`)
  return join(dir, `${slug}-agent-${agentId}.md`)
}

function resolveExistingPath(path: string): string {
  const resolved = resolve(path)
  try {
    return realpathSync(resolved)
  } catch {
    return resolved
  }
}

export function isPlanFilePathForActiveConversation(path: string): boolean {
  const key = getActivePlanConversationKey() ?? DEFAULT_CONVERSATION_KEY
  const planDir = resolveExistingPath(getPlanDirectory())
  const expectedMainPlanPath = resolveExistingPath(
    getPlanFilePath(undefined, key),
  )
  const target = resolveExistingPath(path)

  const rel = relative(planDir, target)
  if (!rel || rel === '') return false
  if (rel.startsWith('..')) return false
  if (isAbsolute(rel)) return false

  const expectedSlug = parse(expectedMainPlanPath).name
  const targetName = parse(target).name
  return (
    targetName === expectedSlug ||
    targetName.startsWith(`${expectedSlug}-agent-`)
  )
}

export function isMainPlanFilePathForActiveConversation(path: string): boolean {
  const key = getActivePlanConversationKey() ?? DEFAULT_CONVERSATION_KEY
  const expected = resolveExistingPath(getPlanFilePath(undefined, key))
  const target = resolveExistingPath(path)
  return target === expected
}

export function isPathInPlanDirectory(path: string): boolean {
  const dir = resolve(getPlanDirectory())
  const target = resolve(path)
  const rel = relative(dir, target)
  if (!rel || rel === '') return true
  if (rel.startsWith('..')) return false
  if (isAbsolute(rel)) return false
  return true
}

export function readPlanFile(
  agentId?: string,
  conversationKey?: string,
): { content: string; exists: boolean; planFilePath: string } {
  const planFilePath = getPlanFilePath(agentId, conversationKey)
  if (!existsSync(planFilePath)) {
    return { content: '', exists: false, planFilePath }
  }
  return {
    content: readFileSync(planFilePath, 'utf8'),
    exists: true,
    planFilePath,
  }
}
