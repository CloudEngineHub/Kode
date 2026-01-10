import { spawn } from 'child_process'
import type { OptionSubtree } from '#ui-ink/components/CustomSelect/select'
import { getModelManager } from '#core/utils/model'
import type { AgentSourceFilter } from './types'
import { DEFAULT_AGENT_MODEL } from './types'

export function openInEditor(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform
    let command: string
    let args: string[]

    switch (platform) {
      case 'darwin':
        command = 'open'
        args = [filePath]
        break
      case 'win32':
        command = 'cmd'
        args = ['/c', 'start', '', filePath]
        break
      default:
        command = 'xdg-open'
        args = [filePath]
        break
    }

    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.unref()
    child.on('error', err => reject(err))
    child.on('exit', code =>
      code === 0 ? resolve() : reject(new Error(`Editor exited with ${code}`)),
    )
  })
}

export function titleForSource(source: AgentSourceFilter): string {
  switch (source) {
    case 'all':
      return 'Agents'
    case 'built-in':
      return 'Built-in agents'
    case 'plugin':
      return 'Plugin agents'
    case 'userSettings':
      return 'User agents'
    case 'projectSettings':
      return 'Project agents'
    case 'policySettings':
      return 'Managed agents'
    case 'flagSettings':
      return 'CLI arg agents'
    default:
      return 'Agents'
  }
}

export function formatModelShort(model: string | undefined): string {
  const value = model || DEFAULT_AGENT_MODEL
  return value === 'inherit' ? 'inherit' : value
}

export function formatModelLong(model: string | undefined): string {
  if (!model) return 'Sonnet (default)'
  if (model === 'inherit') return 'Inherit from parent'
  if (model === 'sonnet' || model === 'opus' || model === 'haiku') {
    return model.charAt(0).toUpperCase() + model.slice(1)
  }
  return model
}

export function getToolNameFromSpec(spec: string): string {
  const trimmed = spec.trim()
  if (!trimmed) return trimmed
  const match = trimmed.match(/^([^(]+)\\(([^)]+)\\)$/)
  if (!match) return trimmed
  const toolName = match[1]?.trim()
  return toolName || trimmed
}

export function parseMcpToolName(
  name: string,
): { serverName: string; toolName: string } | null {
  if (!name.startsWith('mcp__')) return null
  const parts = name.split('__')
  if (parts.length < 3) return null
  return {
    serverName: parts[1] || 'unknown',
    toolName: parts.slice(2).join('__'),
  }
}

export function toSelectableToolNames(
  toolSpecs: string[] | '*',
): string[] | undefined {
  if (toolSpecs === '*') return undefined
  const names = toolSpecs.map(getToolNameFromSpec).filter(Boolean)
  if (names.includes('*')) return undefined
  return names
}

export function modelOptions(): (
  | OptionSubtree
  | { label: string; value: string }
)[] {
  const profiles = (() => {
    try {
      return getModelManager().getActiveModelProfiles() as Array<{
        name: string
        modelName: string
        provider?: string
      }>
    } catch {
      return []
    }
  })()

  const base: Array<{ label: string; value: string }> = [
    { value: 'sonnet', label: 'Task (alias: sonnet)' },
    { value: 'opus', label: 'Main (alias: opus)' },
    { value: 'haiku', label: 'Quick (alias: haiku)' },
    { value: 'inherit', label: 'Inherit from parent' },
  ]

  const extras: Array<{ label: string; value: string }> = []
  for (const profile of profiles) {
    if (!profile?.name) continue
    const value = profile.name
    if (base.some(o => o.value === value)) continue
    extras.push({
      value,
      label:
        profile.provider && profile.modelName
          ? `${profile.name} (${profile.provider}:${profile.modelName})`
          : profile.name,
    })
  }

  if (extras.length === 0) return base

  return [
    { header: 'Compatibility aliases', options: base },
    {
      header: 'Model profiles',
      options: extras.sort((a, b) => a.label.localeCompare(b.label)),
    },
  ]
}
