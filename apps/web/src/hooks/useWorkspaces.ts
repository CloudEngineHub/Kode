import React from 'react'

import type { WorkspaceInfo } from '../lib/workspaces'
import { fetchWorkspaces } from '../lib/workspaces'

const WORKSPACE_STORAGE_KEY = 'kode.webui.workspace'

export function useWorkspaces(args: { token: string | null }): {
  workspaces: WorkspaceInfo[]
  workspaceId: string | null
  setWorkspaceId: (id: string | null) => void
  loading: boolean
} {
  const [workspaces, setWorkspaces] = React.useState<WorkspaceInfo[]>([])
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!args.token) return

    setLoading(true)
    fetchWorkspaces(args.token)
      .then(({ workspaces: nextWorkspaces, currentId }) => {
        setWorkspaces(nextWorkspaces)

        const stored = (() => {
          try {
            return window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
          } catch {
            return null
          }
        })()

        const selected =
          (stored && nextWorkspaces.some(w => w.id === stored)
            ? stored
            : null) ||
          (currentId && nextWorkspaces.some(w => w.id === currentId)
            ? currentId
            : null) ||
          (nextWorkspaces[0]?.id ?? null)

        setWorkspaceId(selected)
      })
      .catch(() => {
        setWorkspaces([])
        setWorkspaceId(null)
      })
      .finally(() => setLoading(false))
  }, [args.token])

  React.useEffect(() => {
    if (!workspaceId) return
    try {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId)
    } catch {}
  }, [workspaceId])

  return { workspaces, workspaceId, setWorkspaceId, loading }
}
