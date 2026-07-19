import { afterEach, describe, expect, test } from 'bun:test'

import {
  addNotification,
  clearNotifications,
  getNotifications,
} from '#core/services/notificationCenter'

afterEach(() => {
  clearNotifications()
})

describe('notification center', () => {
  test('keeps anonymous notifications append-only', () => {
    addNotification({ message: 'first' })
    addNotification({ message: 'second' })

    expect(getNotifications().map(n => n.message)).toEqual(['first', 'second'])
  })

  test('updates explicit-id notifications in place as a single record', () => {
    addNotification({
      id: 'stable',
      createdAt: 1,
      message: 'old',
      channel: 'test',
    })
    addNotification({
      id: 'other',
      createdAt: 2,
      message: 'other',
      channel: 'test',
    })
    addNotification({
      id: 'stable',
      createdAt: 3,
      message: 'new',
      channel: 'test',
    })

    expect(getNotifications().map(n => [n.id, n.message, n.createdAt])).toEqual(
      [
        ['other', 'other', 2],
        ['stable', 'new', 3],
      ],
    )
  })
})
