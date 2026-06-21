import type { TaskSummary } from '#core/utils/taskStorage'

export type TaskListRenderModel =
  | {
      kind: 'empty'
      message: string
    }
  | {
      kind: 'list'
      items: Array<{
        icon: '◻' | '◼' | '✔'
        iconDim: boolean
        content: string
        contentBold: boolean
        contentDim: boolean
        contentStrikethrough: boolean
      }>
    }

function statusIcon(status: TaskSummary['status']): '◻' | '◼' | '✔' {
  switch (status) {
    case 'completed':
      return '✔'
    case 'in_progress':
      return '◼'
    default:
      return '◻'
  }
}

export function getTaskListRenderModel(
  tasks: TaskSummary[],
): TaskListRenderModel {
  if (tasks.length === 0) {
    return { kind: 'empty', message: 'No tasks currently tracked' }
  }

  return {
    kind: 'list',
    items: tasks.map(task => {
      const isCompleted = task.status === 'completed'
      const isInProgress = task.status === 'in_progress'
      const isBlocked = !isCompleted && task.blockedBy.length > 0

      const owner = task.owner ? ` (${task.owner})` : ''
      const blocked = isBlocked
        ? ` [blocked by ${task.blockedBy.map(id => `#${id}`).join(', ')}]`
        : ''

      return {
        icon: statusIcon(task.status),
        iconDim: isCompleted,
        content: `#${task.id} ${task.subject}${owner}${blocked}`,
        contentBold: isInProgress,
        contentDim: isCompleted,
        contentStrikethrough: isCompleted,
      }
    }),
  }
}
