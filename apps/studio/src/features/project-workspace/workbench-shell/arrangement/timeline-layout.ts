export function timelinePositionRatio(positionTick: number, timelineEndTick: number): number {
  if (!Number.isFinite(positionTick) || !Number.isFinite(timelineEndTick) || timelineEndTick <= 0) {
    return 0
  }

  return Math.min(1, Math.max(0, positionTick / timelineEndTick))
}

interface PagedFollowScrollInput {
  readonly clientWidth: number
  readonly positionRatio: number
  readonly scrollLeft: number
  readonly scrollWidth: number
}

/** Keeps the Playhead on discrete viewport pages instead of continuously centering it. */
export function resolvePagedFollowScrollLeft(input: PagedFollowScrollInput): number {
  const clientWidth = Math.max(0, input.clientWidth)
  const scrollWidth = Math.max(0, input.scrollWidth)
  const maximumScrollLeft = Math.max(0, scrollWidth - clientWidth)
  const currentScrollLeft = Math.min(maximumScrollLeft, Math.max(0, input.scrollLeft))
  if (clientWidth === 0 || scrollWidth === 0) return currentScrollLeft

  const positionInlineOffset = Math.min(1, Math.max(0, input.positionRatio)) * scrollWidth
  const currentPageEnd = currentScrollLeft + clientWidth
  if (positionInlineOffset >= currentScrollLeft && positionInlineOffset < currentPageEnd) {
    return currentScrollLeft
  }

  const targetPageStart = Math.floor(positionInlineOffset / clientWidth) * clientWidth
  return Math.min(maximumScrollLeft, Math.max(0, targetPageStart))
}
