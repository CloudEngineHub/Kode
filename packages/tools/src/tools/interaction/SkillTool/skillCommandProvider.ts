export type SkillCommandProvider = () => Promise<unknown[]>

let skillCommandProvider: SkillCommandProvider | null = null

export function setSkillCommandProvider(
  provider: SkillCommandProvider | null,
): void {
  skillCommandProvider = provider
}

export async function loadSkillCommandsFromProvider(): Promise<unknown[]> {
  if (!skillCommandProvider) return []

  try {
    const commands = await skillCommandProvider()
    return Array.isArray(commands) ? commands : []
  } catch {
    return []
  }
}
