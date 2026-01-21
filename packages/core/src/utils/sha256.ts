import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolve())
  })
  return hash.digest('hex')
}
