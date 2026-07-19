import { renderAnsiFrameDiff } from './ansiDiff'
import type { TerminalFrame } from './frame'

export type TerminalFrameWriter = (chunk: string) => void

export class TerminalFrameRenderer {
  private frontFrame: TerminalFrame | null = null
  private backFrame: TerminalFrame | null = null

  constructor(private readonly write: TerminalFrameWriter) {}

  get currentFrame(): TerminalFrame | null {
    return this.frontFrame
  }

  get pendingFrame(): TerminalFrame | null {
    return this.backFrame
  }

  setFrame(frame: TerminalFrame): void {
    this.backFrame = frame
  }

  flush(): string {
    if (!this.backFrame) return ''

    const output = renderAnsiFrameDiff(this.frontFrame, this.backFrame)
    if (output) this.write(output)

    this.frontFrame = this.backFrame
    this.backFrame = null

    return output
  }

  reset(): void {
    this.frontFrame = null
    this.backFrame = null
  }
}
