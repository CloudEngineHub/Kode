import { describe, expect, test } from 'bun:test'
import { splitCommand } from '#core/utils/commands'

describe('splitCommand', () => {
  test('splits on ampersand operator', () => {
    expect(splitCommand('sleep 1 & rm -rf /')).toEqual(['sleep 1', 'rm -rf /'])
  })

  test('does not split on &> redirection', () => {
    expect(splitCommand('echo hi &> out.txt')).toEqual(['echo hi &> out.txt'])
  })

  test('splits on |& operator', () => {
    expect(splitCommand('echo hi |& wc -l')).toEqual(['echo hi', 'wc -l'])
  })

  test('treats backslash-newline as line continuation (not a command separator)', () => {
    expect(splitCommand('echo ok\\\nrm')).toEqual(['echo okrm'])
  })

  test('splits on unescaped newline', () => {
    expect(splitCommand('echo ok\nrm')).toEqual(['echo ok', 'rm'])
  })
})
