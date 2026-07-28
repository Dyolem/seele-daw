import {
  parsePositiveTick,
  parseTick,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  createTimelineGrid,
  resolveTimelineGridTick,
} from '#internal/index'

describe('Timeline Grid', () => {
  it('creates an immutable Grid with an explicit origin and subdivision', () => {
    const grid = createTimelineGrid({
      originTick: parseTick(60),
      subdivisionSpanTick: parsePositiveTick(240),
    })

    expect(grid).toEqual({
      originTick: 60,
      subdivisionSpanTick: 240,
    })
    expect(Object.isFrozen(grid)).toBe(true)
  })

  it.each([
    { expected: 0, position: 0 },
    { expected: 0, position: 119.999 },
    { expected: 240, position: 120 },
    { expected: 240, position: 239.999 },
    { expected: 240, position: 240 },
    { expected: 480, position: 360 },
  ])(
    'snaps Tick position $position to nearest Grid Tick $expected',
    ({ expected, position }) => {
      expect(
        resolveTimelineGridTick({
          grid: createTimelineGrid({
            originTick: parseTick(0),
            subdivisionSpanTick: parsePositiveTick(240),
          }),
          snapEnabled: true,
          tickPosition: position,
        }),
      ).toBe(expected)
    },
  )

  it('resolves subdivisions relative to a non-zero Grid origin', () => {
    const grid = createTimelineGrid({
      originTick: parseTick(60),
      subdivisionSpanTick: parsePositiveTick(120),
    })

    expect(
      resolveTimelineGridTick({
        grid,
        snapEnabled: true,
        tickPosition: 120,
      }),
    ).toBe(180)
    expect(
      resolveTimelineGridTick({
        grid,
        snapEnabled: true,
        tickPosition: 239,
      }),
    ).toBe(180)
  })

  it('rounds to the nearest integer Tick without applying subdivisions when Snap is disabled', () => {
    const grid = createTimelineGrid({
      originTick: parseTick(60),
      subdivisionSpanTick: parsePositiveTick(240),
    })

    expect(
      resolveTimelineGridTick({
        grid,
        snapEnabled: false,
        tickPosition: 239.499,
      }),
    ).toBe(239)
    expect(
      resolveTimelineGridTick({
        grid,
        snapEnabled: false,
        tickPosition: 239.5,
      }),
    ).toBe(240)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects invalid continuous Tick position %s',
    (tickPosition) => {
      expect(() =>
        resolveTimelineGridTick({
          grid: createTimelineGrid({
            originTick: parseTick(0),
            subdivisionSpanTick: parsePositiveTick(240),
          }),
          snapEnabled: true,
          tickPosition,
        }),
      ).toThrow(
        expect.objectContaining({
          code: 'invalid-tick-position',
        }),
      )
    },
  )

  it('rejects positions before the first Grid origin', () => {
    expect(() =>
      resolveTimelineGridTick({
        grid: createTimelineGrid({
          originTick: parseTick(60),
          subdivisionSpanTick: parsePositiveTick(240),
        }),
        snapEnabled: true,
        tickPosition: 59.999,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'tick-position-before-grid-origin',
      }),
    )
  })

  it('rejects a nearest Grid boundary beyond the safe Tick range', () => {
    expect(() =>
      resolveTimelineGridTick({
        grid: createTimelineGrid({
          originTick: parseTick(Number.MAX_SAFE_INTEGER - 5),
          subdivisionSpanTick: parsePositiveTick(10),
        }),
        snapEnabled: true,
        tickPosition: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'resolved-tick-out-of-range',
      }),
    )
  })
})
