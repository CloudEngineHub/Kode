import { afterEach, describe, expect, test } from 'bun:test'
import {
  __clearPastedImageDataForTests,
  releasePastedImageAttachments,
  resolvePastedImageAttachments,
  storePastedImageAttachment,
} from '#ui-ink/components/PromptInput/pastes'

afterEach(() => {
  __clearPastedImageDataForTests()
})

describe('prompt image paste store', () => {
  test('keeps base64 data out of render-facing attachment metadata', () => {
    const data = Buffer.from('image-data').toString('base64')
    const attachment = storePastedImageAttachment({
      placeholder: '[Image #1]',
      image: {
        data,
        mediaType: 'image/png',
      },
    })

    expect('data' in attachment).toBe(false)
    expect(attachment).toEqual({
      id: 'pasted-image-1',
      placeholder: '[Image #1]',
      mediaType: 'image/png',
      byteLength: 10,
    })

    expect(resolvePastedImageAttachments([attachment])).toEqual([
      {
        ...attachment,
        data,
      },
    ])

    releasePastedImageAttachments([attachment])
    expect(resolvePastedImageAttachments([attachment])).toEqual([])
  })
})
