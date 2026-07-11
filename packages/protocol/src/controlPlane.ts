import { z } from 'zod'

/**
 * Versioned HTTP control-plane contracts for daemon-owned background work and
 * tool-permission state. These types intentionally do not expose local file
 * paths or in-memory process handles.
 */
export const DaemonTaskKindSchema = z.enum(['shell', 'agent', 'goal'])
export type DaemonTaskKind = 'shell' | 'agent' | 'goal'

export const DaemonTaskStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
  'orphaned',
  'interrupted',
])
export type DaemonTaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'orphaned'
  | 'interrupted'

export const DaemonTaskSourceSchema = z.enum([
  'runtime',
  'durable',
  'runtime_and_durable',
])
export type DaemonTaskSource = 'runtime' | 'durable' | 'runtime_and_durable'

export type DaemonTask = {
  id: string
  kind: DaemonTaskKind
  status: DaemonTaskStatus
  source: DaemonTaskSource
  description: string
  command: string | null
  sessionId: string | null
  startedAt: number
  updatedAt: number
  completedAt: number | null
  outputAvailable: boolean
  error: string | null
}

export const DaemonTaskSchema = z
  .object({
    id: z.string().min(1),
    kind: DaemonTaskKindSchema,
    status: DaemonTaskStatusSchema,
    source: DaemonTaskSourceSchema,
    description: z.string(),
    command: z.string().nullable(),
    sessionId: z.string().nullable(),
    startedAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative().nullable(),
    outputAvailable: z.boolean(),
    error: z.string().nullable(),
  })
  .strict()
export type DaemonTaskListResponse = { tasks: DaemonTask[] }

export const DaemonTaskListResponseSchema = z
  .object({ tasks: z.array(DaemonTaskSchema) })
  .strict()
export type DaemonTaskDetailResponse = { task: DaemonTask }

export const DaemonTaskDetailResponseSchema = z
  .object({ task: DaemonTaskSchema })
  .strict()
export type DaemonTaskOutputResponse = {
  task: DaemonTask
  content: string
  tailLines: number | null
}

export const DaemonTaskOutputResponseSchema = z
  .object({
    task: DaemonTaskSchema,
    content: z.string(),
    tailLines: z.number().int().positive().nullable(),
  })
  .strict()
export type DaemonTaskCancelResponse = {
  task: DaemonTask
  cancelled: boolean
  alreadyTerminal: boolean
}

export const DaemonTaskCancelResponseSchema = z
  .object({
    task: DaemonTaskSchema,
    cancelled: z.boolean(),
    alreadyTerminal: z.boolean(),
  })
  .strict()

export const DaemonPermissionModeSchema = z.enum([
  'yolo',
  'cautious',
  'default',
  'acceptEdits',
  'plan',
  'bypassPermissions',
  'dontAsk',
])
export type DaemonPermissionMode =
  | 'yolo'
  | 'cautious'
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'bypassPermissions'
  | 'dontAsk'

export const DaemonPermissionDestinationSchema = z.enum([
  'session',
  'localSettings',
  'userSettings',
  'projectSettings',
  'flagSettings',
  'policySettings',
  'cliArg',
  'command',
])
export type DaemonPermissionDestination =
  | 'session'
  | 'localSettings'
  | 'userSettings'
  | 'projectSettings'
  | 'flagSettings'
  | 'policySettings'
  | 'cliArg'
  | 'command'

export const DaemonPermissionRuleBehaviorSchema = z.enum([
  'allow',
  'deny',
  'ask',
])
export type DaemonPermissionRuleBehavior = 'allow' | 'deny' | 'ask'

export type DaemonPermissionUpdate =
  | {
      type: 'setMode'
      mode: DaemonPermissionMode
      destination: DaemonPermissionDestination
    }
  | {
      type: 'addRules' | 'replaceRules' | 'removeRules'
      destination: DaemonPermissionDestination
      behavior: DaemonPermissionRuleBehavior
      rules: string[]
    }
  | {
      type: 'addDirectories' | 'removeDirectories'
      destination: DaemonPermissionDestination
      directories: string[]
    }

const NonEmptyStringArraySchema = z.array(z.string().trim().min(1)).min(1)

export const DaemonPermissionUpdateSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('setMode'),
      mode: DaemonPermissionModeSchema,
      destination: DaemonPermissionDestinationSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('addRules'),
      destination: DaemonPermissionDestinationSchema,
      behavior: DaemonPermissionRuleBehaviorSchema,
      rules: NonEmptyStringArraySchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('replaceRules'),
      destination: DaemonPermissionDestinationSchema,
      behavior: DaemonPermissionRuleBehaviorSchema,
      rules: z.array(z.string().trim().min(1)),
    })
    .strict(),
  z
    .object({
      type: z.literal('removeRules'),
      destination: DaemonPermissionDestinationSchema,
      behavior: DaemonPermissionRuleBehaviorSchema,
      rules: NonEmptyStringArraySchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('addDirectories'),
      destination: DaemonPermissionDestinationSchema,
      directories: NonEmptyStringArraySchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('removeDirectories'),
      destination: DaemonPermissionDestinationSchema,
      directories: NonEmptyStringArraySchema,
    })
    .strict(),
])
export type DaemonPermissionSnapshot = {
  source: 'runtime' | 'disk'
  sessionId: string | null
  mode: DaemonPermissionMode
  isBypassPermissionsModeAvailable: boolean
  additionalWorkingDirectories: Array<{
    path: string
    source: DaemonPermissionDestination
  }>
  rules: {
    allow: Partial<Record<DaemonPermissionDestination, string[]>>
    deny: Partial<Record<DaemonPermissionDestination, string[]>>
    ask: Partial<Record<DaemonPermissionDestination, string[]>>
  }
}

export const DaemonPermissionSnapshotSchema = z
  .object({
    source: z.enum(['runtime', 'disk']),
    sessionId: z.string().nullable(),
    mode: DaemonPermissionModeSchema,
    isBypassPermissionsModeAvailable: z.boolean(),
    additionalWorkingDirectories: z.array(
      z
        .object({
          path: z.string().min(1),
          source: DaemonPermissionDestinationSchema,
        })
        .strict(),
    ),
    rules: z
      .object({
        allow: z.record(DaemonPermissionDestinationSchema, z.array(z.string())),
        deny: z.record(DaemonPermissionDestinationSchema, z.array(z.string())),
        ask: z.record(DaemonPermissionDestinationSchema, z.array(z.string())),
      })
      .strict(),
  })
  .strict()
export type DaemonPermissionSnapshotResponse = {
  permission: DaemonPermissionSnapshot
}

export const DaemonPermissionSnapshotResponseSchema = z
  .object({ permission: DaemonPermissionSnapshotSchema })
  .strict()
export type DaemonPermissionUpdateResponse = {
  permission: DaemonPermissionSnapshot
  persisted: boolean
  refreshedSessionIds: string[]
  inflightApprovalCount: number
}

export const DaemonPermissionUpdateResponseSchema = z
  .object({
    permission: DaemonPermissionSnapshotSchema,
    persisted: z.boolean(),
    refreshedSessionIds: z.array(z.string()),
    inflightApprovalCount: z.number().int().nonnegative(),
  })
  .strict()
