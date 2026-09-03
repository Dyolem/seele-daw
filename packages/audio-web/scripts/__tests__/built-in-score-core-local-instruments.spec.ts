import { describe, expect, it } from 'vitest'

import { BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS } from '../built-in-score-core-local-instruments'
import { BUILT_IN_LOCAL_MANIFEST_POLICY } from '../built-in-local-manifest-policy'

const EXPECTED_SOUNDBANK_IDS = [
  'acoustic-bass',
  'bassoon',
  'brass-ensemble',
  'cello-section',
  'clarinet',
  'double-bass-section',
  'flute',
  'french-horn',
  'general-midi-percussion',
  'muted-trumpet',
  'oboe',
  'orchestral-harp',
  'solo-violin',
  'string-ensemble',
  'string-ensemble-pizzicato',
  'string-ensemble-tremolo',
  'studio-grand',
  'timpani',
  'trombone',
  'trumpet',
  'tuba',
  'viola-section',
]

describe('built-in Score Core local instruments', () => {
  it('freezes the reviewed 22-Soundbank product identity set', () => {
    expect(
      BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.map(({ preparation }) =>
        String(preparation.soundbankId),
      ).sort(),
    ).toEqual(EXPECTED_SOUNDBANK_IDS)
    expect(
      new Set(
        BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.map(
          ({ preparation }) => preparation.generatedDirectoryName,
        ),
      ).size,
    ).toBe(BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.length)
  })

  it('records six exact input fingerprints and bounded preparation limits per Soundbank', () => {
    for (const { preparation } of BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS) {
      expect(preparation.expectedInputFingerprints).toHaveLength(6)
      expect(
        new Set(preparation.expectedInputFingerprints.map(({ relativePath }) => relativePath)).size,
      ).toBe(6)
      expect(
        preparation.expectedInputFingerprints.every(({ sha256 }) => /^[0-9a-f]{64}$/.test(sha256)),
      ).toBe(true)
      expect(preparation.archiveLimits).toMatchObject({
        maximumArchiveByteLength: expect.any(Number),
        maximumCompressionRatio: 64,
        maximumEntryByteLength: expect.any(Number),
        maximumEntryCount: expect.any(Number),
        maximumTotalUncompressedByteLength: expect.any(Number),
      })
      expect(preparation.generatedDirectoryName).toBe(preparation.soundbankId)
    }
  })

  it('keeps product routing distinct from reviewed source-index identity', () => {
    const mutedTrumpet = BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.find(
      ({ preparation }) => preparation.soundbankId === 'muted-trumpet',
    )
    expect(mutedTrumpet).toMatchObject({
      plannedRoute: { kind: 'general-midi-program', programNumber: 59 },
      preparation: {
        expectedCanonicalForProgram: false,
        expectedGeneralMidiProgram: 56,
      },
    })

    const percussion = BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.find(
      ({ preparation }) => preparation.soundbankId === 'general-midi-percussion',
    )
    expect(percussion).toMatchObject({
      plannedRoute: { channel: 9, kind: 'percussion-channel' },
      preparation: {
        expectedCanonicalForProgram: true,
        expectedGeneralMidiProgram: -1,
        manifestPolicy: BUILT_IN_LOCAL_MANIFEST_POLICY.generalMidiPercussionV1,
        productPitchRange: { maximumPitch: 81, minimumPitch: 35 },
      },
    })

    expect(
      BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.filter(
        ({ preparation }) =>
          preparation.manifestPolicy === BUILT_IN_LOCAL_MANIFEST_POLICY.preserveSourceControlsV1,
      ),
    ).toHaveLength(21)
  })

  it('uses the source-authored keyboard coverage without copying the piano range', () => {
    const nonPianoMelodic = BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS.filter(
      ({ preparation }) =>
        preparation.soundbankId !== 'studio-grand' &&
        preparation.soundbankId !== 'general-midi-percussion',
    )
    expect(
      nonPianoMelodic.every(
        ({ preparation }) =>
          preparation.productPitchRange.minimumPitch === 21 &&
          preparation.productPitchRange.maximumPitch === 119,
      ),
    ).toBe(true)
  })
})
