import { decodeSampleInstrumentDeviceState } from '@seele-daw/playback'
import { PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE } from '@seele-daw/project-midi'
import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_SCORE_QUALITY_PLACEHOLDER,
  BUILT_IN_SCORE_QUALITY_ROUTE_EXPECTATIONS,
  createBuiltInScoreQualityMidiBytes,
  createBuiltInScoreQualityMidiDocument,
  createBuiltInScoreQualityPlaybackFixture,
} from '@/development/built-in-score-quality/fixture'
import { decodeMidiProgramPlaceholderDeviceState } from '@/workbench/instrument/midi-import-instrument-policy'

describe('MI5 built-in multi-instrument score quality fixture', () => {
  it('encodes an original Type 1 score with the reviewed families and controller inputs', () => {
    const document = createBuiltInScoreQualityMidiDocument()
    const bytes = createBuiltInScoreQualityMidiBytes()

    expect(document).toMatchObject({ format: 1, ppq: 480 })
    expect(document.tracks).toHaveLength(8)
    expect(bytes.slice(0, 4)).toEqual(new Uint8Array([0x4d, 0x54, 0x68, 0x64]))
    expect(
      document.tracks.map(({ channel, programNumber }) => ({ channel, programNumber })),
    ).toEqual([
      { channel: 0, programNumber: 0 },
      { channel: 1, programNumber: 48 },
      { channel: 2, programNumber: 56 },
      { channel: 3, programNumber: 73 },
      { channel: 4, programNumber: 32 },
      { channel: 5, programNumber: 47 },
      { channel: 9, programNumber: 0 },
      BUILT_IN_SCORE_QUALITY_PLACEHOLDER,
    ])
    expect(document.tracks[0]?.controlChanges).toContainEqual({
      controller: 64,
      tick: 720,
      value: 127,
    })
    expect(document.tracks[6]?.notes.map(({ pitch }) => pitch)).toContain(46)
    expect(document.tracks[6]?.notes.map(({ pitch }) => pitch)).toContain(42)
    expect(Object.isFrozen(document)).toBe(true)
    expect(Object.isFrozen(document.tracks)).toBe(true)
  })

  it('round-trips through MIDI import and schedules only the seven playable Catalogue routes', () => {
    const fixture = createBuiltInScoreQualityPlaybackFixture()
    const actualSoundbanks = [
      ...new Set(fixture.voicePlans.map(({ soundbankId }) => soundbankId)),
    ].sort()
    const expectedSoundbanks = BUILT_IN_SCORE_QUALITY_ROUTE_EXPECTATIONS.map(
      ({ soundbankId }) => soundbankId,
    )
      .slice()
      .sort()

    expect(fixture.decodedDocument.tracks).toHaveLength(8)
    expect(fixture.snapshot.tracks).toHaveLength(8)
    expect(
      fixture.snapshot.midiNotePartitions.reduce(
        (noteCount, partition) => noteCount + partition.notes.length,
        0,
      ),
    ).toBe(26)
    expect(fixture.projectPlan.status).toBe('partial')
    expect(fixture.projectPlan.tracks).toHaveLength(7)
    expect(fixture.voicePlans).toHaveLength(25)
    expect(actualSoundbanks).toEqual(expectedSoundbanks)
    expect(fixture.importDiagnostics).toContainEqual(
      expect.objectContaining({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PROGRAM_UNAVAILABLE,
        sourceProgramNumber: BUILT_IN_SCORE_QUALITY_PLACEHOLDER.programNumber,
      }),
    )
    expect(fixture.projectPlan.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'instrument-runtime-missing' }),
    )

    const playableDeviceStates = fixture.snapshot.devices
      .map(decodeSampleInstrumentDeviceState)
      .filter((state) => state !== null)
    expect(playableDeviceStates).toHaveLength(7)
    expect(
      fixture.snapshot.devices
        .map(decodeMidiProgramPlaceholderDeviceState)
        .find((state) => state !== null),
    ).toEqual(BUILT_IN_SCORE_QUALITY_PLACEHOLDER)
  })

  it('preserves initial CC7/CC10 and derives pedal-aware final Gate times', () => {
    const fixture = createBuiltInScoreQualityPlaybackFixture()

    for (const expectation of BUILT_IN_SCORE_QUALITY_ROUTE_EXPECTATIONS) {
      const route = fixture.projectPlan.tracks.find(
        ({ instrument }) => instrument.soundbankId === expectation.soundbankId,
      )
      const plan = fixture.voicePlans.find(
        ({ soundbankId }) => soundbankId === expectation.soundbankId,
      )
      expect(route?.gain).toBeCloseTo(expectation.gain, 12)
      expect(route?.pan).toBeCloseTo(expectation.pan, 12)
      expect(plan?.channel).toBe(expectation.channel)
    }

    const pedalHeldPianoPlans = fixture.voicePlans.filter(
      ({ keyReleasePlaybackClockSecond, releasePlaybackClockSecond, soundbankId }) =>
        soundbankId === 'studio-grand' &&
        keyReleasePlaybackClockSecond < releasePlaybackClockSecond,
    )
    expect(pedalHeldPianoPlans).toHaveLength(3)
    expect(
      pedalHeldPianoPlans.every(
        ({ releasePlaybackClockSecond }) => releasePlaybackClockSecond === 1.75,
      ),
    ).toBe(true)
    expect(
      fixture.voicePlans.some(
        ({ channel, soundbankId }) => channel === 9 && soundbankId === 'general-midi-percussion',
      ),
    ).toBe(true)
  })
})
