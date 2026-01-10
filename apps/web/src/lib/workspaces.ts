export type WorkspaceInfo = {
  id: string
  path: string
  title: string
  branch: string | null
  isCurrent: boolean
}

export async function fetchWorkspaces(token: string): Promise<{
  workspaces: WorkspaceInfo[]
  currentId: string
}> {
  const res = await fetch('/api/workspaces', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`Failed to load workspaces (${res.status})`)

  const json: unknown = await res.json()
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid workspaces response')
  }
  const obj = json as Record<string, unknown>
  const workspacesRaw = Array.isArray(obj.workspaces) ? obj.workspaces : []
  const currentId = typeof obj.currentId === 'string' ? obj.currentId : ''

  const workspaces: WorkspaceInfo[] = workspacesRaw
    .filter(
      (w): w is Record<string, unknown> => Boolean(w) && typeof w === 'object',
    )
    .map(w => ({
      id: typeof w.id === 'string' ? w.id : '',
      path: typeof w.path === 'string' ? w.path : '',
      title: typeof w.title === 'string' ? w.title : '',
      branch: typeof w.branch === 'string' ? w.branch : null,
      isCurrent: w.isCurrent === true,
    }))
    .filter(w => Boolean(w.id))

  return { workspaces, currentId }
}
