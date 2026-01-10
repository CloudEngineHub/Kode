function isIndexInsideCodeBlock(content: string, indexToTest: number): boolean {
  let fenceCount = 0
  let searchPos = 0
  while (searchPos < content.length) {
    const nextFence = content.indexOf('```', searchPos)
    if (nextFence === -1 || nextFence >= indexToTest) {
      break
    }
    fenceCount += 1
    searchPos = nextFence + 3
  }
  return fenceCount % 2 === 1
}

function findEnclosingCodeBlockStart(content: string, index: number): number {
  if (!isIndexInsideCodeBlock(content, index)) {
    return -1
  }
  let searchPos = 0
  while (searchPos < index) {
    const blockStartIndex = content.indexOf('```', searchPos)
    if (blockStartIndex === -1 || blockStartIndex >= index) {
      break
    }
    const blockEndIndex = content.indexOf('```', blockStartIndex + 3)
    if (blockStartIndex < index) {
      if (blockEndIndex === -1 || index < blockEndIndex + 3) {
        return blockStartIndex
      }
    }
    if (blockEndIndex === -1) break
    searchPos = blockEndIndex + 3
  }
  return -1
}

export function findSafeSplitPoint(content: string, maxLength: number): number {
  if (content.length <= maxLength) return content.length

  if (isIndexInsideCodeBlock(content, maxLength)) {
    const enclosingStart = findEnclosingCodeBlockStart(content, maxLength)
    if (enclosingStart > 0) {
      return enclosingStart
    }
  }

  let searchStart = Math.min(maxLength, content.length)
  while (searchStart >= 0) {
    const dnlIndex = content.lastIndexOf('\n\n', searchStart)
    if (dnlIndex === -1) break
    const splitPoint = dnlIndex + 2
    if (splitPoint > 0 && !isIndexInsideCodeBlock(content, splitPoint)) {
      return splitPoint
    }
    searchStart = dnlIndex - 1
  }

  searchStart = Math.min(maxLength, content.length)
  while (searchStart >= 0) {
    const nlIndex = content.lastIndexOf('\n', searchStart)
    if (nlIndex === -1) break
    const splitPoint = nlIndex + 1
    if (splitPoint > 0 && !isIndexInsideCodeBlock(content, splitPoint)) {
      return splitPoint
    }
    searchStart = nlIndex - 1
  }

  return Math.min(maxLength, content.length)
}

export function splitMarkdownIntoChunks(
  content: string,
  maxChunkLength: number,
): string[] {
  if (!content) return ['']
  if (maxChunkLength <= 0 || content.length <= maxChunkLength) {
    return [content]
  }

  const chunks: string[] = []
  let remaining = content

  while (remaining.length > maxChunkLength) {
    const splitPoint = findSafeSplitPoint(remaining, maxChunkLength)
    if (splitPoint <= 0) {
      chunks.push(remaining.slice(0, maxChunkLength))
      remaining = remaining.slice(maxChunkLength)
      continue
    }
    chunks.push(remaining.slice(0, splitPoint))
    remaining = remaining.slice(splitPoint)
  }

  if (remaining.length > 0) {
    chunks.push(remaining)
  }

  return chunks
}
