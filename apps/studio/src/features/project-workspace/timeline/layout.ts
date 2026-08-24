import { parseTick, type Tick } from '@seele-daw/project-core'

export function timelinePositionRatio(positionTick: number, timelineEndTick: number): number {
  if (!Number.isFinite(positionTick) || !Number.isFinite(timelineEndTick) || timelineEndTick <= 0) {
    return 0
  }

  return Math.min(1, Math.max(0, positionTick / timelineEndTick))
}

interface TimelineLocateTickInput {
  readonly clientX: number
  readonly scrollLeft: number
  readonly scrollWidth: number
  readonly timelineEndTick: Tick
  readonly viewportLeft: number
}

/** Maps a Ruler pointer through the horizontal viewport to the nearest integer Project Tick. */
export function resolveTimelineLocateTick(input: TimelineLocateTickInput): Tick {
  if (
    !Number.isFinite(input.clientX) ||
    !Number.isFinite(input.scrollLeft) ||
    !Number.isFinite(input.scrollWidth) ||
    !Number.isFinite(input.viewportLeft) ||
    input.scrollWidth <= 0
  ) {
    return parseTick(0)
  }

  const contentInlineOffset = Math.min(
    input.scrollWidth,
    Math.max(0, input.scrollLeft + input.clientX - input.viewportLeft),
  )
  return parseTick(Math.round((contentInlineOffset / input.scrollWidth) * input.timelineEndTick))
}

interface TimelineEdgeScrollVelocityInput {
  readonly clientX: number
  readonly edgeInlineSize: number
  readonly maximumVelocity: number
  readonly viewportLeft: number
  readonly viewportRight: number
}

/** Resolves signed continuous scroll velocity from pointer penetration into viewport edges. */
export function resolveTimelineEdgeScrollVelocity(input: TimelineEdgeScrollVelocityInput): number {
  if (
    !Number.isFinite(input.clientX) ||
    !Number.isFinite(input.edgeInlineSize) ||
    !Number.isFinite(input.maximumVelocity) ||
    !Number.isFinite(input.viewportLeft) ||
    !Number.isFinite(input.viewportRight) ||
    input.edgeInlineSize <= 0 ||
    input.maximumVelocity <= 0 ||
    input.viewportRight <= input.viewportLeft
  ) {
    return 0
  }

  const leftDistance = input.clientX - input.viewportLeft
  if (leftDistance < input.edgeInlineSize) {
    return (
      -input.maximumVelocity * Math.min(1, Math.max(0, 1 - leftDistance / input.edgeInlineSize))
    )
  }

  const rightDistance = input.viewportRight - input.clientX
  if (rightDistance < input.edgeInlineSize) {
    return (
      input.maximumVelocity * Math.min(1, Math.max(0, 1 - rightDistance / input.edgeInlineSize))
    )
  }

  return 0
}

interface PagedFollowScrollInput {
  readonly clientWidth: number
  readonly positionRatio: number
  readonly scrollLeft: number
  readonly scrollWidth: number
}

interface CenteredTimelineScrollInput {
  readonly clientWidth: number
  readonly positionRatio: number
  readonly scrollWidth: number
}

/** Centers a Timeline fact when possible and clamps either end to the native scroll range. */
export function resolveCenteredTimelineScrollLeft(input: CenteredTimelineScrollInput): number {
  const clientWidth = Math.max(0, input.clientWidth)
  const scrollWidth = Math.max(0, input.scrollWidth)
  const maximumScrollLeft = Math.max(0, scrollWidth - clientWidth)
  if (clientWidth === 0 || scrollWidth === 0) return 0

  const positionInlineOffset = Math.min(1, Math.max(0, input.positionRatio)) * scrollWidth
  return Math.min(maximumScrollLeft, Math.max(0, positionInlineOffset - clientWidth / 2))
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
