import { describe, expect, it } from 'vitest'

import {
  resolvePagedFollowScrollLeft,
  resolveTimelineLocateTick,
  timelinePositionRatio,
} from '@/features/project-workspace/timeline/layout'
import { parseTick } from '@seele-daw/project-core'

describe('Arrangement Timeline layout', () => {
  it('normalizes the visual position to the derived Timeline range', () => {
    expect(timelinePositionRatio(1_920, 3_840)).toBe(0.5)
    expect(timelinePositionRatio(-1, 3_840)).toBe(0)
    expect(timelinePositionRatio(7_680, 3_840)).toBe(1)
    expect(timelinePositionRatio(Number.NaN, 3_840)).toBe(0)
  })

  it('retains the current page while the Playhead remains visible', () => {
    expect(
      resolvePagedFollowScrollLeft({
        clientWidth: 400,
        positionRatio: 0.24,
        scrollLeft: 0,
        scrollWidth: 1_600,
      }),
    ).toBe(0)
  })

  it('jumps to the next page only after the Playhead reaches its boundary', () => {
    expect(
      resolvePagedFollowScrollLeft({
        clientWidth: 400,
        positionRatio: 0.25,
        scrollLeft: 0,
        scrollWidth: 1_600,
      }),
    ).toBe(400)
  })

  it('can reveal a position behind the current page and clamps the Timeline end', () => {
    expect(
      resolvePagedFollowScrollLeft({
        clientWidth: 400,
        positionRatio: 0,
        scrollLeft: 800,
        scrollWidth: 1_600,
      }),
    ).toBe(0)
    expect(
      resolvePagedFollowScrollLeft({
        clientWidth: 400,
        positionRatio: 1,
        scrollLeft: 0,
        scrollWidth: 1_600,
      }),
    ).toBe(1_200)
  })

  it('does not move before the viewport has measurable geometry', () => {
    expect(
      resolvePagedFollowScrollLeft({
        clientWidth: 0,
        positionRatio: 0.75,
        scrollLeft: 160,
        scrollWidth: 1_600,
      }),
    ).toBe(160)
  })

  it('maps a scrolled Ruler pointer to the nearest bounded Project Tick', () => {
    const input = {
      scrollLeft: 400,
      scrollWidth: 1_600,
      timelineEndTick: parseTick(30_720),
      viewportLeft: 100,
    }

    expect(resolveTimelineLocateTick({ ...input, clientX: 300 })).toBe(11_520)
    expect(resolveTimelineLocateTick({ ...input, clientX: -1_000 })).toBe(0)
    expect(resolveTimelineLocateTick({ ...input, clientX: 2_000 })).toBe(30_720)
    expect(resolveTimelineLocateTick({ ...input, clientX: 300.027 })).toBe(11_521)
  })
})
