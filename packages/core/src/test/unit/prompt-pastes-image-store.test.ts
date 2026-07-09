import { afterEach, describe, expect, test } from 'bun:test'
import {
  __clearPastedImageDataForTests,
  releasePastedImageAttachments,
  releaseStalePastedImageAttachments,
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

  test('releases only image data no longer referenced by prompt state', () => {
    const firstData = Buffer.from('first-image').toString('base64')
    const secondData = Buffer.from('second-image').toString('base64')
    const first = storePastedImageAttachment({
      placeholder: '[Image #1]',
      image: {
        data: firstData,
        mediaType: 'image/png',
      },
    })
    const second = storePastedImageAttachment({
      placeholder: '[Image #2]',
      image: {
        data: secondData,
        mediaType: 'image/png',
      },
    })

    releaseStalePastedImageAttachments({
      previous: [first, second],
      next: [second],
    })

    expect(resolvePastedImageAttachments([first])).toEqual([])
    expect(resolvePastedImageAttachments([second])).toEqual([
      {
        ...second,
        data: secondData,
      },
    ])
  })
})
