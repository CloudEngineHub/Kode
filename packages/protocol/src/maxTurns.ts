export class MaxTurnsExceededError extends Error {
  readonly maxTurns: number
  readonly turnCount: number

  constructor(args: { maxTurns: number; turnCount: number }) {
    super(`Reached max turns limit (${args.maxTurns})`)
    this.name = 'MaxTurnsExceededError'
    this.maxTurns = args.maxTurns
    this.turnCount = args.turnCount
  }
}
