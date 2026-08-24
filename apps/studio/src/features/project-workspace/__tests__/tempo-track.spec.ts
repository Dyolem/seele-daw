import {
  createTempoEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  createInitialProjectTempoTrackScale,
  expandProjectTempoTrackScale,
  orderProjectTempoEvents,
  projectTempoTrackBpmPositionRatio,
  resolveDraggedProjectTempoBpm,
  resolveProjectTempoTrackBpm,
  resolveProjectTempoTrackDragAxis,
  resolveProjectTempoTrackTick,
} from '@/features/project-workspace/tempo-track/tempo-track'

function tempoEvent(id: string, tick: number, bpm: number) {
  return createTempoEventRecord({
    bpm: parseTempoBpm(bpm),
    id: parseTempoEventId(id),
    tick: parseTick(tick),
  })
}

describe('Tempo Track projection', () => {
  it('orders Tempo Events and keeps ordinary maps in a legible default scale', () => {
    const later = tempoEvent('tempo-later', 960, 90)
    const initial = tempoEvent('tempo-initial', 0, 120)

    expect(orderProjectTempoEvents([later, initial])).toEqual([initial, later])
    expect(createInitialProjectTempoTrackScale([later, initial])).toEqual({
      maximumBpm: 240,
      minimumBpm: 40,
    })
    expect(projectTempoTrackBpmPositionRatio(240, { minimumBpm: 40, maximumBpm: 240 })).toBe(0)
    expect(projectTempoTrackBpmPositionRatio(40, { minimumBpm: 40, maximumBpm: 240 })).toBe(1)
  })

  it('expands the scale to retain legal imported extreme values', () => {
    expect(
      createInitialProjectTempoTrackScale([
        tempoEvent('tempo-minimum', 0, 5),
        tempoEvent('tempo-maximum', 960, 999),
      ]),
    ).toEqual({ maximumBpm: 999, minimumBpm: 5 })
  })

  it('fits imported low tempos while keeping the ordinary upper view boundary', () => {
    expect(
      createInitialProjectTempoTrackScale([
        tempoEvent('tempo-imported-low', 0, 15.545_455_040_082_661),
      ]),
    ).toEqual({ maximumBpm: 240, minimumBpm: 5 })
  })

  it('expands a transient view without contracting it when facts later disappear', () => {
    const expanded = expandProjectTempoTrackScale({ maximumBpm: 240, minimumBpm: 40 }, [
      tempoEvent('tempo-expanded', 960, 300),
    ])

    expect(expanded).toEqual({ maximumBpm: 320, minimumBpm: 40 })
    expect(expandProjectTempoTrackScale(expanded, [tempoEvent('tempo-ordinary', 0, 120)])).toBe(
      expanded,
    )
  })

  it('maps pointer coordinates to integer Tick and two-decimal BPM values', () => {
    expect(
      resolveProjectTempoTrackTick({
        clientX: 350,
        laneLeft: 100,
        laneWidth: 1_000,
        timelineEndTick: parseTick(3_840),
      }),
    ).toBe(960)
    expect(
      resolveProjectTempoTrackBpm({
        clientY: 75,
        laneHeight: 100,
        laneTop: 50,
        scale: { maximumBpm: 240, minimumBpm: 40 },
      }),
    ).toBe(190)
  })

  it('applies vertical drag delta without jumping from an off-center point grab', () => {
    expect(
      resolveDraggedProjectTempoBpm({
        currentClientY: 40,
        laneHeight: 100,
        scale: { maximumBpm: 240, minimumBpm: 40 },
        startBpm: parseTempoBpm(120),
        startClientY: 50,
      }),
    ).toBe(140)
    expect(
      resolveDraggedProjectTempoBpm({
        currentClientY: -1_000,
        laneHeight: 100,
        scale: { maximumBpm: 240, minimumBpm: 40 },
        startBpm: parseTempoBpm(120),
        startClientY: 50,
      }),
    ).toBe(999)
  })

  it('locks the dominant axis only after the click-tolerance threshold', () => {
    expect(resolveProjectTempoTrackDragAxis(3, 3, true)).toBeNull()
    expect(resolveProjectTempoTrackDragAxis(6, 2, true)).toBe('tick')
    expect(resolveProjectTempoTrackDragAxis(2, -6, true)).toBe('bpm')
    expect(resolveProjectTempoTrackDragAxis(6, 2, false)).toBe('blocked-tick')
  })
})
