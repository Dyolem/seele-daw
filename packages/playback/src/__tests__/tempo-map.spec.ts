import {
  createTempoEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  type TempoEventRecord,
  type Tick,
} from '@seele-daw/project-core'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { resolveProjectSecondAtTick } from '#internal/index'

import {
  parsePlaybackClockDurationSecond,
  parsePlaybackClockSecond,
  type PlaybackClockDurationSecond,
  type PlaybackClockSecond,
  type ProjectSecond,
} from '#internal/time/project-time'
import { createTempoMap, createTempoMapFromSegments } from '#internal/time/tempo-map'

function tempoEvent(id: string, tick: number, bpm: number): TempoEventRecord {
  return createTempoEventRecord({
    bpm: parseTempoBpm(bpm),
    id: parseTempoEventId(id),
    tick: parseTick(tick),
  })
}

describe('Playback Clock values', () => {
  it('brands finite non-negative clock times and durations', () => {
    const playbackClockSecond = parsePlaybackClockSecond(20.25)
    const playbackClockDuration = parsePlaybackClockDurationSecond(0.1)

    expect(playbackClockSecond).toBe(20.25)
    expect(playbackClockDuration).toBe(0.1)
    expect(parsePlaybackClockSecond(-0)).toBe(0)
    expectTypeOf(playbackClockSecond).toEqualTypeOf<PlaybackClockSecond>()
    expectTypeOf(playbackClockDuration).toEqualTypeOf<PlaybackClockDurationSecond>()
  })

  it.each([
    ['a negative clock time', () => parsePlaybackClockSecond(-0.001)],
    ['an unsafe clock time', () => parsePlaybackClockSecond(Number.MAX_SAFE_INTEGER + 1)],
    ['an infinite clock time', () => parsePlaybackClockSecond(Number.POSITIVE_INFINITY)],
    ['a NaN clock duration', () => parsePlaybackClockDurationSecond(Number.NaN)],
  ] as const)('rejects %s', (_case, action) => {
    expect(action).toThrow(RangeError)
  })
})

describe('TempoMap', () => {
  it('converts constant-tempo ticks and seconds at the Project PPQ', () => {
    const tempoEvents = [tempoEvent('tempo-constant', 0, 120)]
    const tempoMap = createTempoMap(tempoEvents)

    expect(tempoMap.projectSecondAtTick(parseTick(0))).toBe(0)
    expect(tempoMap.projectSecondAtTick(parseTick(960))).toBe(0.5)
    expect(tempoMap.projectSecondAtTick(parseTick(3_840))).toBe(2)
    expect(tempoMap.tickPositionAtProjectSecond(0.75 as ProjectSecond)).toBe(1_440)
    expect(resolveProjectSecondAtTick(tempoEvents, parseTick(960))).toBe(0.5)
    expect(Object.isFrozen(tempoMap)).toBe(true)
  })

  it('uses each Tempo Event from its own Tick and continues the last tempo indefinitely', () => {
    const later = tempoEvent('tempo-later', 2_880, 240)
    const initial = tempoEvent('tempo-initial', 0, 120)
    const middle = tempoEvent('tempo-middle', 1_920, 60)
    const input = [later, initial, middle]
    const tempoMap = createTempoMap(input)

    expect(tempoMap.projectSecondAtTick(parseTick(1_920))).toBe(1)
    expect(tempoMap.projectSecondAtTick(parseTick(2_880))).toBe(2)
    expect(tempoMap.projectSecondAtTick(parseTick(3_840))).toBe(2.25)
    expect(tempoMap.tickPositionAtProjectSecond(1 as ProjectSecond)).toBe(1_920)
    expect(tempoMap.tickPositionAtProjectSecond(1.5 as ProjectSecond)).toBe(2_400)
    expect(tempoMap.tickPositionAtProjectSecond(2 as ProjectSecond)).toBe(2_880)
    expect(tempoMap.tickPositionAtProjectSecond(2.125 as ProjectSecond)).toBe(3_360)
    expect(input).toEqual([later, initial, middle])
  })

  it('maps the expanded Project Tempo boundaries', () => {
    const tempoMap = createTempoMap([
      tempoEvent('tempo-minimum', 0, 5),
      tempoEvent('tempo-maximum', 960, 999),
    ])

    expect(tempoMap.projectSecondAtTick(parseTick(960))).toBe(12)
    expect(tempoMap.projectSecondAtTick(parseTick(1_920))).toBeCloseTo(12 + 60 / 999, 12)
    expect(tempoMap.tickPositionAtProjectSecond(12 as ProjectSecond)).toBe(960)
  })

  it('does not retain the caller array or its Tempo Event records', () => {
    const initial = tempoEvent('tempo-isolated-initial', 0, 120)
    const later = tempoEvent('tempo-isolated-later', 1_920, 60)
    const input = [initial, later]
    const tempoMap = createTempoMap(input)

    input.reverse()
    Object.assign(later as { tick: Tick }, { tick: parseTick(960) })

    expect(tempoMap.projectSecondAtTick(parseTick(1_920))).toBe(1)
    expect(tempoMap.projectSecondAtTick(parseTick(2_880))).toBe(2)
  })

  it('rehydrates the Tempo Segment plan the compiler produces', () => {
    const original = createTempoMap([
      tempoEvent('tempo-segment-plan-initial', 0, 120),
      tempoEvent('tempo-segment-plan-later', 960, 60),
    ])
    const rehydrated = createTempoMapFromSegments(original.segments)

    expect(rehydrated.projectSecondAtTick(parseTick(960))).toBe(0.5)
    expect(rehydrated.projectSecondAtTick(parseTick(1_920))).toBe(1.5)
    expect(rehydrated.tickPositionAtProjectSecond(1 as ProjectSecond)).toBe(1_440)
    expect(Object.isFrozen(original.segments)).toBe(true)
    expect(Object.isFrozen(original.segments[0])).toBe(true)
  })

  it('round-trips continuous positions across Tempo Segment boundaries', () => {
    const tempoMap = createTempoMap([
      tempoEvent('tempo-roundtrip-initial', 0, 137),
      tempoEvent('tempo-roundtrip-middle', 1_111, 83.5),
      tempoEvent('tempo-roundtrip-last', 4_000, 311),
    ])

    for (const tick of [0, 1, 1_110, 1_111, 1_112, 3_999, 4_000, 9_601]) {
      const projectSecond = tempoMap.projectSecondAtTick(parseTick(tick))
      const position = tempoMap.tickPositionAtProjectSecond(projectSecond)

      expect(position).toBeCloseTo(tick, 8)
    }
  })
})
