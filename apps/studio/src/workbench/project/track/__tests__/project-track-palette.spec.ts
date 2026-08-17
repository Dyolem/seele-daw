import { parseProjectColor } from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { ProjectTrackError } from '@/workbench/project/track/project-track-error'
import {
  PROJECT_TRACK_PALETTE,
  selectProjectTrackColor,
} from '@/workbench/project/track/project-track-palette'

describe('Project Track Palette', () => {
  it('publishes a fixed unique uppercase Palette', () => {
    expect(PROJECT_TRACK_PALETTE).toEqual([
      '#8B5CF6',
      '#4F8CFF',
      '#16B8D4',
      '#23B26D',
      '#D6A43B',
      '#F27A3D',
      '#E85474',
      '#C65AD9',
    ])
    expect(new Set(PROJECT_TRACK_PALETTE).size).toBe(PROJECT_TRACK_PALETTE.length)
    expect(Object.isFrozen(PROJECT_TRACK_PALETTE)).toBe(true)
  })

  it('maps the complete unit interval deterministically', () => {
    expect(selectProjectTrackColor(0, null)).toBe(PROJECT_TRACK_PALETTE[0])
    expect(selectProjectTrackColor(0.999_999, null)).toBe(
      PROJECT_TRACK_PALETTE[PROJECT_TRACK_PALETTE.length - 1],
    )
  })

  it('excludes an adjacent Palette color without changing the stored Palette', () => {
    const adjacentColor = PROJECT_TRACK_PALETTE[0]!

    expect(selectProjectTrackColor(0, adjacentColor)).toBe(PROJECT_TRACK_PALETTE[1])
    expect(selectProjectTrackColor(0, parseProjectColor('#000000'))).toBe(PROJECT_TRACK_PALETTE[0])
    expect(PROJECT_TRACK_PALETTE[0]).toBe(adjacentColor)
  })

  it.each([-1, 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid random value: %s',
    (randomValue) => {
      expect(() => selectProjectTrackColor(randomValue, null)).toThrowError(
        expect.objectContaining<Partial<ProjectTrackError>>({
          name: 'ProjectTrackError',
          code: 'invalid-random-value',
          randomValue,
        }),
      )
    },
  )
})
