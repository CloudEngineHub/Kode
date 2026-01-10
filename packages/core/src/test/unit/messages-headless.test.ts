import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

describe('#core/utils/messages (headless module)', () => {
  test('does not import Ink/React or UI components', () => {
    const resolved = Bun.resolveSync('#core/utils/messages', import.meta.dir)
    const content = readFileSync(resolved, 'utf8')
    expect(content).not.toContain("from 'ink'")
    expect(content).not.toContain('from "ink"')
    expect(content).not.toContain("from 'react'")
    expect(content).not.toContain('from "react"')
    expect(content).not.toContain('#ui-ink/')
  })
})
