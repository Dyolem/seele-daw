import {
  createTempoEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  type TempoEventRecord,
  type Tick,
} from '@seele-daw/project-core'
import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  ProjectTimeError,
  parseContinuousTickPosition,
  parseProjectDurationSecond,
  parseProjectSecond,
  type ContinuousTickPosition,
  type ProjectDurationSecond,
  type ProjectSecond,
} from '#internal/time/project-time'
import { TempoMapError, createTempoMap } from '#internal/time/tempo-map'

function tempoEvent(id: string, tick: number, bpm: number): TempoEventRecord {
  return createTempoEventRecord({
    bpm: parseTempoBpm(bpm),
    id: parseTempoEventId(id),
    tick: parseTick(tick),
  })
}

function captureError(action: () => void): unknown {
  try {
    action()
  } catch (error) {
    return error
  }

  throw new Error('Expected action to throw')
}

describe('Project time values', () => {
  it('brands finite non-negative values without rounding continuous positions', () => {
    const projectSecond = parseProjectSecond(0.125)
    const projectDuration = parseProjectDurationSecond(1.75)
    const tickPosition = parseContinuousTickPosition(960.5)

    expect(projectSecond).toBe(0.125)
    expect(projectDuration).toBe(1.75)
    expect(tickPosition).toBe(960.5)
    expect(parseProjectSecond(-0)).toBe(0)
    expectTypeOf(projectSecond).toEqualTypeOf<ProjectSecond>()
    expectTypeOf(projectDuration).toEqualTypeOf<ProjectDurationSecond>()
    expectTypeOf(tickPosition).toEqualTypeOf<ContinuousTickPosition>()
  })

  it.each([
    ['invalid-project-second', () => parseProjectSecond(-1)],
    ['invalid-project-duration-second', () => parseProjectDurationSecond(Number.NaN)],
    [
      'invalid-continuous-tick-position',
      () => parseContinuousTickPosition(Number.POSITIVE_INFINITY),
    ],
    ['invalid-project-second', () => parseProjectSecond(Number.MAX_SAFE_INTEGER + 1)],
  ] as const)('rejects invalid values with stable code %s', (code, action) => {
    const error = captureError(action)

    expect(error).toBeInstanceOf(ProjectTimeError)
    expect(error).toMatchObject({ code })
  })
})

describe('TempoMap', () => {
  it('converts constant-tempo ticks, seconds, and ranges at the Project PPQ', () => {
    const tempoMap = createTempoMap([tempoEvent('tempo-constant', 0, 120)])

    expect(tempoMap.projectSecondAtTick(parseTick(0))).toBe(0)
    expect(tempoMap.projectSecondAtTick(parseTick(960))).toBe(0.5)
    expect(tempoMap.projectSecondAtTick(parseTick(3_840))).toBe(2)
    expect(tempoMap.tickPositionAtProjectSecond(parseProjectSecond(0.75))).toBe(1_440)
    expect(tempoMap.durationBetweenTicks(parseTick(960), parseTick(2_880))).toBe(1)
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
    expect(tempoMap.tickPositionAtProjectSecond(parseProjectSecond(1))).toBe(1_920)
    expect(tempoMap.tickPositionAtProjectSecond(parseProjectSecond(1.5))).toBe(2_400)
    expect(tempoMap.tickPositionAtProjectSecond(parseProjectSecond(2))).toBe(2_880)
    expect(tempoMap.tickPositionAtProjectSecond(parseProjectSecond(2.125))).toBe(3_360)
    expect(tempoMap.durationBetweenTicks(parseTick(960), parseTick(3_360))).toBe(1.625)
    expect(input).toEqual([later, initial, middle])
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

  it('computes a short duration without subtracting large absolute Project times', () => {
    const tempoMap = createTempoMap([tempoEvent('tempo-large-tick-duration', 0, 400)])
    const endTick = parseTick(Number.MAX_SAFE_INTEGER)
    const startTick = parseTick(Number.MAX_SAFE_INTEGER - 1)

    expect(tempoMap.durationBetweenTicks(startTick, endTick)).toBeCloseTo(60 / (400 * 960), 12)
  })

  it.each([
    ['invalid-initial-tempo-event-count', [] as TempoEventRecord[]],
    ['invalid-initial-tempo-event-count', [tempoEvent('tempo-no-zero', 960, 120)]],
    [
      'invalid-initial-tempo-event-count',
      [tempoEvent('tempo-zero-a', 0, 120), tempoEvent('tempo-zero-b', 0, 90)],
    ],
    [
      'duplicate-tempo-event-tick',
      [
        tempoEvent('tempo-duplicate-initial', 0, 120),
        tempoEvent('tempo-duplicate-a', 960, 90),
        tempoEvent('tempo-duplicate-b', 960, 150),
      ],
    ],
  ] as const)('rejects invalid Tempo Event topology with code %s', (code, events) => {
    const error = captureError(() => createTempoMap(events))

    expect(error).toBeInstanceOf(TempoMapError)
    expect(error).toMatchObject({ code })
  })

  it('normalizes invalid input failures at the TempoMap boundary', () => {
    const invalidListError = captureError(() => createTempoMap({} as readonly TempoEventRecord[]))
    const invalidEvent = {
      ...tempoEvent('tempo-invalid-event', 0, 120),
      bpm: Number.NaN,
    } as unknown as TempoEventRecord
    const invalidEventError = captureError(() => createTempoMap([invalidEvent]))

    expect(invalidListError).toMatchObject({
      code: 'invalid-tempo-event-list',
    })
    expect(invalidEventError).toMatchObject({ code: 'invalid-tempo-event' })
  })

  it('fails closed for invalid queries, reversed ranges, and inverse overflow', () => {
    const tempoMap = createTempoMap([tempoEvent('tempo-query-errors', 0, 20)])
    const invalidTickError = captureError(() => tempoMap.projectSecondAtTick(-1 as Tick))
    const invalidSecondError = captureError(() =>
      tempoMap.tickPositionAtProjectSecond(Number.NaN as ProjectSecond),
    )
    const reversedRangeError = captureError(() =>
      tempoMap.durationBetweenTicks(parseTick(960), parseTick(0)),
    )
    const overflowError = captureError(() =>
      tempoMap.tickPositionAtProjectSecond(parseProjectSecond(Number.MAX_SAFE_INTEGER)),
    )

    expect(invalidTickError).toBeInstanceOf(RangeError)
    expect(invalidSecondError).toMatchObject({ code: 'invalid-project-second' })
    expect(reversedRangeError).toMatchObject({ code: 'reversed-tick-range' })
    expect(overflowError).toMatchObject({ code: 'numeric-result-out-of-range' })
  })
})
