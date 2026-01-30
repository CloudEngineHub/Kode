export class MaxBudgetUsdExceededError extends Error {
  readonly maxBudgetUsd: number
  readonly totalCostUsd: number

  constructor(args: { maxBudgetUsd: number; totalCostUsd: number }) {
    super(`Exceeded USD budget (${args.maxBudgetUsd})`)
    this.name = 'MaxBudgetUsdExceededError'
    this.maxBudgetUsd = args.maxBudgetUsd
    this.totalCostUsd = args.totalCostUsd
  }
}
