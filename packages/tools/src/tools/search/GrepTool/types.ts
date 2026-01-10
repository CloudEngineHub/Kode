export type GrepOutputMode = 'content' | 'files_with_matches' | 'count'

export type GrepToolOutput = {
  numFiles: number
  filenames: string[]
  mode?: GrepOutputMode
  content?: string
  numLines?: number
  numMatches?: number
  appliedLimit?: number
  appliedOffset?: number
  durationMs: number
}

export type GrepToolCallInput = {
  pattern: string
  path?: string
  glob?: string
  output_mode?: GrepOutputMode
  '-B'?: number
  '-A'?: number
  '-C'?: number
  '-n'?: boolean
  '-i'?: boolean
  type?: string
  head_limit?: number
  offset?: number
  multiline?: boolean
}
