type KodeAgentSessionForkInfo = {
  forkedFromSessionId: string
  forkRootSessionId: string
}

let currentForkInfo: KodeAgentSessionForkInfo | null = null

export function setKodeAgentSessionForkInfo(
  next: KodeAgentSessionForkInfo | null,
): void {
  currentForkInfo = next
}

export function getKodeAgentSessionForkInfo(): KodeAgentSessionForkInfo | null {
  return currentForkInfo
}

export function resetKodeAgentSessionForkInfoForTests(): void {
  currentForkInfo = null
}
