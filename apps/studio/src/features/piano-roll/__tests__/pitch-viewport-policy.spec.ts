import { describe, expect, it } from 'vitest'
import { pianoRollCssPixelToMidiPitch, pianoRollMidiPitchToCssPixel } from '@seele-daw/editor'
import { parseMidiPitch } from '@seele-daw/project-core'
import {
  resolvePitchViewLayout,
  pitchCenterAtScrollTop,
} from '@/features/piano-roll/viewport/pitch-viewport-policy'

describe('Piano Roll pitch viewport', () => {
  it('keeps standard keys at 20px and the center pitch fixed when the panel resizes', () => {
    for (const height of [100, 251, 720]) {
      const layout = resolvePitchViewLayout({
        height,
        centerPitch: 60,
        mode: 'standard',
        rangeSize: 25,
      })
      expect(layout.viewport.pitchRowHeightCssPixel).toBe(20)
      expect(pianoRollMidiPitchToCssPixel(layout.viewport, parseMidiPitch(60)) + 10).toBe(
        height / 2,
      )
      expect(pianoRollCssPixelToMidiPitch(layout.viewport, height / 2)).toBe(60)
    }
  })

  it('supports partial rows without changing pitch or note height', () => {
    const { viewport } = resolvePitchViewLayout({
      height: 251,
      centerPitch: 60,
      mode: 'standard',
      rangeSize: 25,
    })
    expect(viewport).toMatchObject({ maximumPitch: 66, minimumPitch: 54, pitchOffsetCssPixel: 4.5 })
    expect(pianoRollMidiPitchToCssPixel(viewport, parseMidiPitch(66))).toBe(-4.5)
    expect(pianoRollCssPixelToMidiPitch(viewport, 0)).toBe(66)
    expect(pianoRollCssPixelToMidiPitch(viewport, 15.49)).toBe(66)
    expect(pianoRollCssPixelToMidiPitch(viewport, 15.5)).toBe(65)
    expect(pianoRollCssPixelToMidiPitch(viewport, 250.99)).toBe(54)
  })

  it.each([0, 127])('reaches MIDI %s and stays within the full keyboard', (centerPitch) => {
    const layout = resolvePitchViewLayout({
      height: 251,
      centerPitch,
      mode: 'standard',
      rangeSize: 25,
    })
    expect(layout.viewport.minimumPitch).toBeGreaterThanOrEqual(0)
    expect(layout.viewport.maximumPitch).toBeLessThanOrEqual(127)
    expect(pianoRollCssPixelToMidiPitch(layout.viewport, centerPitch === 0 ? 250.99 : 0)).toBe(
      centerPitch,
    )
    expect(pitchCenterAtScrollTop(layout, centerPitch === 0 ? 10_000 : -100)).toBeCloseTo(
      centerPitch === 0 ? 5.775 : 121.225,
    )
  })

  it('keeps a chosen range as the panel resizes, with minimum and maximum key heights', () => {
    for (const [height, rowHeight] of [
      [200, 16],
      [500, 20],
      [750, 30],
      [1500, 48],
    ] as const) {
      const layout = resolvePitchViewLayout({
        height,
        centerPitch: 60,
        mode: 'range',
        rangeSize: 25,
      })
      expect(layout.viewport.pitchRowHeightCssPixel).toBe(rowHeight)
      expect(pianoRollCssPixelToMidiPitch(layout.viewport, height / 2)).toBe(60)
    }
  })
})
