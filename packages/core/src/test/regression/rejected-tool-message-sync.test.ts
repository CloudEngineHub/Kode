import { describe, expect, test } from 'bun:test'
import { FileEditTool } from '#tools/tools/filesystem/FileEditTool/FileEditTool'
import { FileWriteTool } from '#tools/tools/filesystem/FileWriteTool/FileWriteTool'
import { renderInkToolUseRejectedMessage } from '#ui-ink/toolPresenters/registry'

describe('Regression: rejected tool messages are sync', () => {
  test('Write rejected message does not return a Promise', () => {
    const result = renderInkToolUseRejectedMessage(
      FileWriteTool,
      { file_path: '/tmp/kode-test-nonexistent.txt', content: 'hello' },
      { columns: 80, verbose: false, conversationKey: 'test:0' },
    )

    expect(result).not.toBeInstanceOf(Promise)
  })

  test('Edit rejected message does not return a Promise', () => {
    const result = renderInkToolUseRejectedMessage(
      FileEditTool,
      {
        file_path: '/tmp/kode-test-nonexistent.txt',
        old_string: '',
        new_string: 'hello',
        replace_all: false,
      },
      { columns: 80, verbose: false, conversationKey: 'test:0' },
    )

    expect(result).not.toBeInstanceOf(Promise)
  })
})
