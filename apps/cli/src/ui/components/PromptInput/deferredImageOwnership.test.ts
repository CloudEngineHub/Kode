import { afterEach, describe, expect, test } from 'bun:test'
import type { ClipboardImage } from '#core/utils/image/media'
import type { PastedImageAttachment } from './pastes'
import {
  __clearPastedImageDataForTests,
  __getPastedImageDataStoreSizeForTests,
  materializePastedImageAttachments,
  MissingPastedImageDataError,
  releasePastedImageAttachments,
  snapshotPastedImageAttachments,
  storePastedImageAttachment,
} from './pastes'

function imageData(value: string): string {
  return Buffer.from(value).toString('base64')
}

function createAttachment(
  value: string,
  placeholder = '[Image #1]',
  mediaType: ClipboardImage['mediaType'] = 'image/png',
): PastedImageAttachment {
  return storePastedImageAttachment({
    placeholder,
    image: { data: imageData(value), mediaType },
  })
}

function expectMaterializedData(
  attachments: PastedImageAttachment[],
  values: string[],
): void {
  expect(
    materializePastedImageAttachments(attachments).map(image => image.data),
  ).toEqual(values.map(imageData))
}

afterEach(() => {
  __clearPastedImageDataForTests()
})

describe('deferred prompt image ownership', () => {
  test('Enter queue keeps an immutable image snapshot after clearing the draft', () => {
    const draft = [createAttachment('enter-image')]
    const pending = snapshotPastedImageAttachments(draft)

    expect(pending[0]?.id).not.toBe(draft[0]?.id)
    expect(Object.isFrozen(pending[0])).toBe(true)

    releasePastedImageAttachments(draft)
    expectMaterializedData(pending, ['enter-image'])

    releasePastedImageAttachments(pending)
    expect(__getPastedImageDataStoreSizeForTests()).toBe(0)
  })

  test('Tab queue preserves every image until the queued prompt is consumed', () => {
    const draft = [
      createAttachment('tab-first', '[Image #1]', 'image/png'),
      createAttachment('tab-second', '[Image #2]', 'image/jpeg'),
    ]
    const queued = snapshotPastedImageAttachments(draft)

    releasePastedImageAttachments(draft)
    expectMaterializedData(queued, ['tab-first', 'tab-second'])
    expect(materializePastedImageAttachments(queued)[1]?.mediaType).toBe(
      'image/jpeg',
    )

    releasePastedImageAttachments(queued)
    expect(__getPastedImageDataStoreSizeForTests()).toBe(0)
  })

  test('Ctrl+S stash transfers its snapshot back to the restored draft', () => {
    const draft = [createAttachment('stashed-image')]
    const stash = snapshotPastedImageAttachments(draft)

    releasePastedImageAttachments(draft)
    expectMaterializedData(stash, ['stashed-image'])

    const restoredDraft = stash
    expectMaterializedData(restoredDraft, ['stashed-image'])

    releasePastedImageAttachments(restoredDraft)
    expect(__getPastedImageDataStoreSizeForTests()).toBe(0)
  })

  test('canceling multiple deferred owners releases all image data', () => {
    const enterDraft = [createAttachment('pending')]
    const pending = snapshotPastedImageAttachments(enterDraft)
    releasePastedImageAttachments(enterDraft)

    const tabDraft = [createAttachment('queued')]
    const queued = snapshotPastedImageAttachments(tabDraft)
    releasePastedImageAttachments(tabDraft)

    expect(__getPastedImageDataStoreSizeForTests()).toBe(2)
    releasePastedImageAttachments(pending)
    releasePastedImageAttachments(queued)
    expect(__getPastedImageDataStoreSizeForTests()).toBe(0)
  })

  test('repeated sends with the same placeholder never share image data', () => {
    const firstDraft = [createAttachment('first-send')]
    const firstQueued = snapshotPastedImageAttachments(firstDraft)
    releasePastedImageAttachments(firstDraft)

    const secondDraft = [createAttachment('second-send')]
    const secondQueued = snapshotPastedImageAttachments(secondDraft)
    releasePastedImageAttachments(secondDraft)

    expect(firstQueued[0]?.id).not.toBe(secondQueued[0]?.id)
    expectMaterializedData(firstQueued, ['first-send'])
    expectMaterializedData(secondQueued, ['second-send'])

    releasePastedImageAttachments(firstQueued)
    expectMaterializedData(secondQueued, ['second-send'])
    releasePastedImageAttachments(secondQueued)
    expect(__getPastedImageDataStoreSizeForTests()).toBe(0)
  })

  test('missing binary data fails before a deferred prompt can be sent', () => {
    const missing: PastedImageAttachment = {
      id: 'missing-image',
      placeholder: '[Image #1]',
      mediaType: 'image/png',
      byteLength: 10,
    }

    expect(() => snapshotPastedImageAttachments([missing])).toThrow(
      MissingPastedImageDataError,
    )
    expect(() => materializePastedImageAttachments([missing])).toThrow(
      'Pasted image data is unavailable',
    )
    expect(__getPastedImageDataStoreSizeForTests()).toBe(0)
  })
})
