import {
  createTempoEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  createProjectTempoEventLocationPresentation,
  createInitialProjectTempoTrackScale,
  expandProjectTempoTrackScale,
  orderProjectTempoEvents,
  projectTempoTrackBpmPositionRatio,
  resolveDraggedProjectTempoBpm,
  resolveNearestProjectTempoTrackEvent,
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
  it('presents the selected Event in musical and precise multi-Tempo project time', () => {
    const initial = tempoEvent('tempo-location-initial', 0, 120)
    const slower = tempoEvent('tempo-location-slower', 3_840, 60)
    const selected = tempoEvent('tempo-location-selected', 5_760, 90)

    expect(
      createProjectTempoEventLocationPresentation({
        barSpanTick: parseTick(3_840),
        tempoEvent: selected,
        tempoEvents: [selected, initial, slower],
        timeSignatureNumerator: 4,
      }),
    ).toEqual({
      musicalPosition: '2 · 3 · 0/960',
      projectTime: '00:04.000',
      title: 'Bar 2, beat 3, 0 of 960 ticks; Project Tick 5760; Project time 00:04.000',
    })
  })

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

  it('selects the nearest dense point inside a bounded geometric hit radius', () => {
    const earlier = tempoEvent('tempo-hit-earlier', 100, 100)
    const later = tempoEvent('tempo-hit-later', 108, 102)
    const input = {
      laneHeight: 100,
      laneLeft: 100,
      laneTop: 50,
      laneWidth: 1_000,
      maximumDistancePx: 14,
      scale: { maximumBpm: 240, minimumBpm: 40 },
      tempoEvents: [later, earlier],
      timelineEndTick: parseTick(1_000),
    }

    expect(resolveNearestProjectTempoTrackEvent({ ...input, clientX: 207, clientY: 119 })).toBe(
      later,
    )
    expect(resolveNearestProjectTempoTrackEvent({ ...input, clientX: 204, clientY: 119.5 })).toBe(
      earlier,
    )
    expect(resolveNearestProjectTempoTrackEvent({ ...input, clientX: 400, clientY: 50 })).toBeNull()
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
