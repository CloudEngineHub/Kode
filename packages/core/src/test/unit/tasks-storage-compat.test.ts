import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from '#core/utils/taskStorage'

describe('tasks storage compat', () => {
  test('createTask picks next id across legacy store and listTasks merges', () => {
    const previousHome = process.env.HOME
    const previousKodeConfigDir = process.env.KODE_CONFIG_DIR
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR

    const homeDir = mkdtempSync(join(tmpdir(), 'kode-task-home-'))
    const kodeDir = mkdtempSync(join(tmpdir(), 'kode-task-kode-'))
    const claudeDir = mkdtempSync(join(tmpdir(), 'kode-task-claude-'))

    process.env.HOME = homeDir
    process.env.KODE_CONFIG_DIR = kodeDir
    process.env.CLAUDE_CONFIG_DIR = claudeDir

    const taskListId = 'tasklist-compat'

    try {
      const legacyDir = join(claudeDir, 'tasks', taskListId)
      mkdirSync(legacyDir, { recursive: true })
      writeFileSync(
        join(legacyDir, '1.json'),
        JSON.stringify(
          {
            id: '1',
            subject: 'Legacy task',
            description: 'From legacy store',
            status: 'pending',
            blocks: [],
            blockedBy: [],
          },
          null,
          2,
        ),
        'utf8',
      )
      writeFileSync(join(legacyDir, '.highwatermark'), '1', 'utf8')

      const created = createTask({
        subject: 'New task',
        description: 'Created in Kode store',
        taskListId,
      })
      expect(created.id).toBe('2')

      const tasks = listTasks(taskListId)
      expect(tasks.map(t => t.id)).toEqual(['1', '2'])
    } finally {
      process.env.HOME = previousHome
      process.env.KODE_CONFIG_DIR = previousKodeConfigDir
      process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(kodeDir, { recursive: true, force: true })
      rmSync(claudeDir, { recursive: true, force: true })
    }
  })

  test('updateTask adopts legacy task into canonical store', () => {
    const previousHome = process.env.HOME
    const previousKodeConfigDir = process.env.KODE_CONFIG_DIR
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR

    const homeDir = mkdtempSync(join(tmpdir(), 'kode-task-home-'))
    const kodeDir = mkdtempSync(join(tmpdir(), 'kode-task-kode-'))
    const claudeDir = mkdtempSync(join(tmpdir(), 'kode-task-claude-'))

    process.env.HOME = homeDir
    process.env.KODE_CONFIG_DIR = kodeDir
    process.env.CLAUDE_CONFIG_DIR = claudeDir

    const taskListId = 'tasklist-adopt'

    try {
      const legacyDir = join(claudeDir, 'tasks', taskListId)
      mkdirSync(legacyDir, { recursive: true })
      writeFileSync(
        join(legacyDir, '1.json'),
        JSON.stringify(
          {
            id: '1',
            subject: 'Legacy task',
            description: 'From legacy store',
            status: 'pending',
            blocks: [],
            blockedBy: [],
          },
          null,
          2,
        ),
        'utf8',
      )

      const updated = updateTask({
        taskId: '1',
        update: { status: 'completed' },
        taskListId,
      })
      expect(updated.ok).toBe(true)

      const task = getTask('1', taskListId)
      expect(task?.status).toBe('completed')
    } finally {
      process.env.HOME = previousHome
      process.env.KODE_CONFIG_DIR = previousKodeConfigDir
      process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(kodeDir, { recursive: true, force: true })
      rmSync(claudeDir, { recursive: true, force: true })
    }
  })

  test('deleteTask tombstones legacy task so it stays hidden', () => {
    const previousHome = process.env.HOME
    const previousKodeConfigDir = process.env.KODE_CONFIG_DIR
    const previousClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR

    const homeDir = mkdtempSync(join(tmpdir(), 'kode-task-home-'))
    const kodeDir = mkdtempSync(join(tmpdir(), 'kode-task-kode-'))
    const claudeDir = mkdtempSync(join(tmpdir(), 'kode-task-claude-'))

    process.env.HOME = homeDir
    process.env.KODE_CONFIG_DIR = kodeDir
    process.env.CLAUDE_CONFIG_DIR = claudeDir

    const taskListId = 'tasklist-delete'

    try {
      const legacyDir = join(claudeDir, 'tasks', taskListId)
      mkdirSync(legacyDir, { recursive: true })
      writeFileSync(
        join(legacyDir, '1.json'),
        JSON.stringify(
          {
            id: '1',
            subject: 'Legacy task',
            description: 'From legacy store',
            status: 'pending',
            blocks: [],
            blockedBy: [],
          },
          null,
          2,
        ),
        'utf8',
      )

      const deleted = deleteTask({ taskId: '1', taskListId })
      expect(deleted.ok).toBe(true)

      expect(getTask('1', taskListId)).toBe(null)
      expect(listTasks(taskListId).map(t => t.id)).toEqual([])
    } finally {
      process.env.HOME = previousHome
      process.env.KODE_CONFIG_DIR = previousKodeConfigDir
      process.env.CLAUDE_CONFIG_DIR = previousClaudeConfigDir
      rmSync(homeDir, { recursive: true, force: true })
      rmSync(kodeDir, { recursive: true, force: true })
      rmSync(claudeDir, { recursive: true, force: true })
    }
  })
})
