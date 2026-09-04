import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_PRESET_LOCAL_INSTRUMENTS,
  EXTENDED_BUILT_IN_PRESET_LOCAL_INSTRUMENTS,
} from '../built-in-preset-local-instruments'
import { BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS } from '../built-in-general-midi-local-instruments'
import { BUILT_IN_LOCAL_MANIFEST_POLICY } from '../built-in-local-manifest-policy'

describe('complete built-in Preset local instruments', () => {
  it('preserves the 86 reviewed GM-route assets while expanding to all 289 sample Presets', () => {
    expect(BUILT_IN_PRESET_LOCAL_INSTRUMENTS).toHaveLength(289)
    expect(EXTENDED_BUILT_IN_PRESET_LOCAL_INSTRUMENTS).toHaveLength(203)
    expect(
      new Set(BUILT_IN_PRESET_LOCAL_INSTRUMENTS.map(({ preparation }) => preparation.soundbankId))
        .size,
    ).toBe(289)
    expect(
      new Set(BUILT_IN_PRESET_LOCAL_INSTRUMENTS.map(({ preparation }) => preparation.sourceSlug))
        .size,
    ).toBe(289)

    const completeBySource = new Map(
      BUILT_IN_PRESET_LOCAL_INSTRUMENTS.map((instrument) => [
        instrument.preparation.sourceSlug,
        instrument,
      ]),
    )
    for (const existing of BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS) {
      expect(completeBySource.get(existing.preparation.sourceSlug)).toBe(existing)
    }
  })

  it('keeps every newly added Preset source-native and fingerprint-pinned', () => {
    for (const instrument of EXTENDED_BUILT_IN_PRESET_LOCAL_INSTRUMENTS) {
      expect(instrument.plannedRoute).toMatchObject({ kind: 'manual-preset' })
      expect(instrument.preparation.productPitchRange).toBeNull()
      expect(instrument.preparation.manifestPolicy).toBe(
        BUILT_IN_LOCAL_MANIFEST_POLICY.preserveSourceControlsV1,
      )
      expect(instrument.preparation.archiveLimits).toEqual({
        maximumArchiveByteLength: 128 * 1_024 * 1_024,
        maximumCompressionRatio: 64,
        maximumEntryByteLength: 8 * 1_024 * 1_024,
        maximumEntryCount: 128,
        maximumTotalUncompressedByteLength: 128 * 1_024 * 1_024,
      })
      expect(instrument.preparation.expectedInputFingerprints).toHaveLength(6)
      expect(
        instrument.preparation.expectedInputFingerprints.every(({ sha256 }) =>
          /^[0-9a-f]{64}$/.test(sha256),
        ),
      ).toBe(true)
    }
  })
})
