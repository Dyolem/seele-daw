import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS,
  EXTENDED_GENERAL_MIDI_LOCAL_INSTRUMENTS,
} from '../built-in-general-midi-local-instruments'
import { BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS } from '../built-in-score-core-local-instruments'
import { BUILT_IN_LOCAL_MANIFEST_POLICY } from '../built-in-local-manifest-policy'

describe('built-in General MIDI local instruments', () => {
  it('extends the unchanged 22-Soundbank Score Core to 86 unique sample assets', () => {
    expect(EXTENDED_GENERAL_MIDI_LOCAL_INSTRUMENTS).toHaveLength(64)
    expect(BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS).toHaveLength(86)
    expect(
      BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS.slice(
        0,
        BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.length,
      ),
    ).toEqual(BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS)
    expect(
      new Set(
        BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS.map(({ preparation }) => preparation.soundbankId),
      ).size,
    ).toBe(86)
    expect(Object.isFrozen(BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS)).toBe(true)
    expect(Object.isFrozen(EXTENDED_GENERAL_MIDI_LOCAL_INSTRUMENTS)).toBe(true)
  })

  it('pins all six source inputs and a common audited archive ceiling per extended asset', () => {
    for (const { preparation } of EXTENDED_GENERAL_MIDI_LOCAL_INSTRUMENTS) {
      expect(preparation.expectedInputFingerprints).toHaveLength(6)
      expect(
        new Set(preparation.expectedInputFingerprints.map(({ relativePath }) => relativePath)).size,
      ).toBe(6)
      expect(
        preparation.expectedInputFingerprints.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256)),
      ).toBe(true)
      expect(preparation.archiveLimits).toEqual({
        maximumArchiveByteLength: 64 * 1_024 * 1_024,
        maximumCompressionRatio: 64,
        maximumEntryByteLength: 8 * 1_024 * 1_024,
        maximumEntryCount: 64,
        maximumTotalUncompressedByteLength: 64 * 1_024 * 1_024,
      })
      expect(preparation.manifestPolicy).toBe(
        BUILT_IN_LOCAL_MANIFEST_POLICY.preserveSourceControlsV1,
      )
    }
  })

  it('records deliberate route and pitch-range exceptions without changing the source facts', () => {
    const fanfareOrgan = EXTENDED_GENERAL_MIDI_LOCAL_INSTRUMENTS.find(
      ({ preparation }) => preparation.soundbankId === 'fanfare-organ',
    )
    expect(fanfareOrgan).toMatchObject({
      plannedRoute: { kind: 'general-midi-program', programNumber: 17 },
      preparation: {
        expectedCanonicalForProgram: false,
        expectedGeneralMidiProgram: 16,
        sourceSlug: 'fanfare-organ-v3-v4',
      },
    })

    expect(
      EXTENDED_GENERAL_MIDI_LOCAL_INSTRUMENTS.find(
        ({ preparation }) => preparation.soundbankId === 'taiko',
      )?.preparation.productPitchRange,
    ).toEqual({ maximumPitch: 67, minimumPitch: 35 })
    expect(
      EXTENDED_GENERAL_MIDI_LOCAL_INSTRUMENTS.find(
        ({ preparation }) => preparation.soundbankId === 'general-midi-drums-hiphop',
      ),
    ).toMatchObject({
      plannedRoute: { kind: 'general-midi-program', programNumber: 118 },
      preparation: {
        expectedCanonicalForProgram: false,
        expectedGeneralMidiProgram: -1,
        productPitchRange: { maximumPitch: 81, minimumPitch: 35 },
      },
    })
    expect(
      EXTENDED_GENERAL_MIDI_LOCAL_INSTRUMENTS.find(
        ({ preparation }) => preparation.soundbankId === 'funk-guitar',
      )?.preparation.productPitchRange,
    ).toEqual({ maximumPitch: 99, minimumPitch: 40 })
  })
})
