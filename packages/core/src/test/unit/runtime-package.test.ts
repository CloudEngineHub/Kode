import { expect, test } from 'bun:test'

test('@runtime package alias resolves (type-only module)', async () => {
  const mod = await import('#runtime')
  expect(mod).toBeTruthy()
  expect(typeof mod).toBe('object')
})
