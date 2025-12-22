// Permission mode types retained for compatibility with earlier agent implementations
export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'bypassPermissions'
  | 'dontAsk'

export interface PermissionContext {
  mode: PermissionMode
  allowedTools: string[]
  allowedPaths: string[]
  restrictions: {
    readOnly: boolean
    requireConfirmation: boolean
    bypassValidation: boolean
  }
  metadata: {
    activatedAt?: string
    previousMode?: PermissionMode
    transitionCount: number
  }
}

export interface ModeConfig {
  name: PermissionMode
  label: string
  icon: string
  color: string
  description: string
  allowedTools: string[]
  restrictions: {
    readOnly: boolean
    requireConfirmation: boolean
    bypassValidation: boolean
  }
}

// Mode configuration preserved for compatibility
export const MODE_CONFIGS: Record<PermissionMode, ModeConfig> = {
  default: {
    name: 'default',
    label: 'Default',
    icon: '',
    color: 'blue',
    description: 'Standard permission checking',
    allowedTools: ['*'],
    restrictions: {
      readOnly: false,
      requireConfirmation: true,
      bypassValidation: false,
    },
  },
  acceptEdits: {
    name: 'acceptEdits',
    label: 'Accept edits',
    icon: '⏵⏵',
    color: 'green',
    description: 'Auto-approve edit operations',
    allowedTools: ['*'],
    restrictions: {
      readOnly: false,
      requireConfirmation: false,
      bypassValidation: false,
    },
  },
  plan: {
    name: 'plan',
    label: 'Plan Mode',
    icon: '⏸',
    color: 'yellow',
    description: 'Research and planning - read-only tools only',
    allowedTools: [
      'Read',
      'Grep',
      'Glob',
      'WebSearch',
      'WebFetch',
      'AskUserQuestion',
      'TodoWrite',
      'Write',
      'Edit',
      'ExitPlanMode',
      'KillShell',
      'TaskOutput',
      'ListMcpResourcesTool',
      'ReadMcpResourceTool',
      'mcp',
    ],
    restrictions: {
      readOnly: true,
      requireConfirmation: true,
      bypassValidation: false,
    },
  },
  bypassPermissions: {
    name: 'bypassPermissions',
    label: 'Bypass Permissions',
    icon: '⏵⏵',
    color: 'red',
    description: 'All permissions bypassed',
    allowedTools: ['*'],
    restrictions: {
      readOnly: false,
      requireConfirmation: false,
      bypassValidation: true,
    },
  },
  dontAsk: {
    name: 'dontAsk',
    label: "Don't Ask",
    icon: '⏵⏵',
    color: 'red',
    description: 'Auto-deny permission prompts',
    allowedTools: ['*'],
    restrictions: {
      readOnly: false,
      requireConfirmation: true,
      bypassValidation: false,
    },
  },
}

// Mode cycling function preserved from the existing workflow
export function getNextPermissionMode(
  currentMode: PermissionMode,
  isBypassAvailable: boolean = true,
): PermissionMode {
  switch (currentMode) {
    case 'default':
      return 'acceptEdits'
    case 'acceptEdits':
      return 'plan'
    case 'plan':
      return isBypassAvailable ? 'bypassPermissions' : 'default'
    case 'bypassPermissions':
      return 'default'
    case 'dontAsk':
      return 'default'
    default:
      return 'default'
  }
}
