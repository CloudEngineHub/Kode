import { expect, test } from 'bun:test'

import {
  __buildToolNameAliasMapForTests,
  resolveToolNameAlias,
} from '#core/utils/toolNameAliases'

test('resolveToolNameAlias maps legacy tool names to canonical ids', () => {
  expect(resolveToolNameAlias('AgentOutputTool')).toEqual({
    originalName: 'AgentOutputTool',
    resolvedName: 'TaskOutput',
    wasAliased: true,
  })

  expect(resolveToolNameAlias('listMcpResources')).toEqual({
    originalName: 'listMcpResources',
    resolvedName: 'ListMcpResourcesTool',
    wasAliased: true,
  })

  expect(resolveToolNameAlias('readMcpResource')).toEqual({
    originalName: 'readMcpResource',
    resolvedName: 'ReadMcpResourceTool',
    wasAliased: true,
  })

  expect(resolveToolNameAlias('TaskOutput')).toEqual({
    originalName: 'TaskOutput',
    resolvedName: 'TaskOutput',
    wasAliased: false,
  })

  expect(resolveToolNameAlias('KillShell')).toEqual({
    originalName: 'KillShell',
    resolvedName: 'TaskStop',
    wasAliased: true,
  })
})

test('tool name alias map rejects conflicting aliases', () => {
  expect(() =>
    __buildToolNameAliasMapForTests({
      CanonicalA: ['conflict'],
      CanonicalB: ['conflict'],
    }),
  ).toThrow('Tool name alias conflict for "conflict"')
})
