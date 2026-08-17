import { parsePositiveTick, parseTick } from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { projectPianoRollPlayheadCssPixel } from '@/features/piano-roll/playhead/playhead-projection'

const CLIP_START_TICK = parseTick(3_840)
const CLIP_SPAN_TICK = parsePositiveTick(3_840)
const FULL_CLIP_VIEWPORT = Object.freeze({
  visibleEndTick: parseTick(3_840),
  visibleSpanTick: parsePositiveTick(3_840),
  visibleStartTick: parseTick(0),
  widthCssPixel: 960,
})

function project(globalTick: number): number | null {
  return projectPianoRollPlayheadCssPixel({
    clipSpanTick: CLIP_SPAN_TICK,
    clipStartTick: CLIP_START_TICK,
    globalTick,
    viewport: FULL_CLIP_VIEWPORT,
  })
}

describe('Piano Roll Playhead projection', () => {
  it('maps continuous global Transport positions into Clip-local CSS Pixels', () => {
    expect(project(3_840)).toBe(0)
    expect(project(4_320.5)).toBe(120.125)
    expect(project(4_800)).toBe(240)
    expect(project(7_680)).toBe(960)
  })

  it('hides positions outside the selected Clip span', () => {
    expect(project(3_839.999)).toBeNull()
    expect(project(7_680.001)).toBeNull()
    expect(project(Number.NaN)).toBeNull()
  })

  it('also respects a future partial Piano Roll viewport', () => {
    const viewport = Object.freeze({
      visibleEndTick: parseTick(2_880),
      visibleSpanTick: parsePositiveTick(1_920),
      visibleStartTick: parseTick(960),
      widthCssPixel: 960,
    })

    expect(
      projectPianoRollPlayheadCssPixel({
        clipSpanTick: CLIP_SPAN_TICK,
        clipStartTick: CLIP_START_TICK,
        globalTick: 4_799.999,
        viewport,
      }),
    ).toBeNull()
    expect(
      projectPianoRollPlayheadCssPixel({
        clipSpanTick: CLIP_SPAN_TICK,
        clipStartTick: CLIP_START_TICK,
        globalTick: 4_800,
        viewport,
      }),
    ).toBe(0)
    expect(
      projectPianoRollPlayheadCssPixel({
        clipSpanTick: CLIP_SPAN_TICK,
        clipStartTick: CLIP_START_TICK,
        globalTick: 5_760,
        viewport,
      }),
    ).toBe(480)
  })
})
