export type WindowedList = {
  start: number
  end: number
  visibleCount: number
  showUpIndicator: boolean
  showDownIndicator: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function getWindowedList(args: {
  itemCount: number
  focusIndex: number
  maxVisible: number
  indicatorRows?: number
}): WindowedList {
  const itemCount = Math.max(0, args.itemCount)
  const focusIndex = clamp(args.focusIndex, 0, Math.max(0, itemCount - 1))
  const maxVisible = Math.max(1, args.maxVisible)
  const indicatorRows = args.indicatorRows ?? 2

  if (itemCount <= maxVisible) {
    return {
      start: 0,
      end: itemCount,
      visibleCount: itemCount,
      showUpIndicator: false,
      showDownIndicator: false,
    }
  }

  const canShowIndicators = maxVisible >= indicatorRows + 1
  const visibleCount = canShowIndicators
    ? maxVisible - indicatorRows
    : maxVisible

  const half = Math.floor(visibleCount / 2)
  const start = clamp(
    focusIndex - half,
    0,
    Math.max(0, itemCount - visibleCount),
  )
  const end = Math.min(itemCount, start + visibleCount)

  return {
    start,
    end,
    visibleCount,
    showUpIndicator: canShowIndicators && start > 0,
    showDownIndicator: canShowIndicators && end < itemCount,
  }
}
