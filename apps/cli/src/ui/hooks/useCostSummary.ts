import { useEffect } from 'react'
import { registerCostSummaryOnExit } from '#core/cost-tracker'

export function useCostSummary(): void {
  useEffect(() => {
    return registerCostSummaryOnExit()
  }, [])
}
