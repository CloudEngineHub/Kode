export type PastedTextSegment = { placeholder: string; text: string }

export type PastedImageAttachment = {
  id: string
  placeholder: string
  mediaType: string
  byteLength: number
}

export type ResolvedPastedImageAttachment = PastedImageAttachment & {
  data: string
}
