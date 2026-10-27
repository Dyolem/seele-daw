import { describe, expect, it } from 'vitest'
import { parseDeviceId } from '@seele-daw/project-core'
import { PROJECT_MIDI_INSTRUMENT_MAPPING_KIND, createProjectMidiImportDraft } from '#internal/index'
import {
  createImportInput,
  createInstrumentDeviceWithId,
  createMidiDocument,
  createMidiNote,
  createMidiTrack,
} from '#internal/__tests__/support/project-midi-import-test-support'

describe('Project MIDI import failures', () => {
  it('rejects tick conversion beyond the Project safe-integer range', () => {
    expect(() =>
      createProjectMidiImportDraft(
        createImportInput(
          createMidiDocument({
            ppq: 1,
            tracks: [
              createMidiTrack({
                notes: [createMidiNote({ tick: Number.MAX_SAFE_INTEGER, durationTicks: 0 })],
              }),
            ],
          }),
        ),
      ),
    ).toThrowError(/^MIDI tick \d+ cannot be represented safely at Project PPQ \d+\.$/)
  })

  it.each([4.99, 999.01])('rejects tempo %s outside the current Project model range', (bpm) => {
    expect(() =>
      createProjectMidiImportDraft(
        createImportInput(createMidiDocument({ tempos: [{ tick: 0, bpm }] })),
      ),
    ).toThrowError(`MIDI tempo ${bpm} BPM at tick 0 is outside the Project range`)
  })

  it('rejects time signatures outside the current Project model domain', () => {
    expect(() =>
      createProjectMidiImportDraft(
        createImportInput(
          createMidiDocument({
            timeSignatures: [{ tick: 0, numerator: 3, denominator: 64 }],
          }),
        ),
      ),
    ).toThrowError(
      'MIDI time signature 3/64 at tick 0 cannot be represented by the current Project model.',
    )
  })

  it('rejects invalid and duplicate generated IDs', () => {
    expect(() =>
      createProjectMidiImportDraft(
        createImportInput(createMidiDocument(), { createId: () => ' ' }),
      ),
    ).toThrowError(/^The MIDI import identity factory could not create a valid .+ ID\.$/)

    expect(() =>
      createProjectMidiImportDraft(
        createImportInput(
          createMidiDocument({
            tracks: [createMidiTrack({ notes: [createMidiNote(), createMidiNote({ pitch: 61 })] })],
          }),
          {
            createId: ({ kind, ordinal }) =>
              kind === 'midi-note' ? 'duplicate-note' : `${kind}-${ordinal}`,
          },
        ),
      ),
    ).toThrowError(
      'The MIDI import identity factory generated duplicate midi-note ID duplicate-note.',
    )
  })

  it('wraps thrown or mismatched instrument device factories', () => {
    expect(() =>
      createProjectMidiImportDraft(
        createImportInput(createMidiDocument(), {
          createInstrumentDevice: () => {
            throw new Error('device unavailable')
          },
        }),
      ),
    ).toThrowError(
      expect.objectContaining({
        message: 'The instrument device factory failed for MIDI track 0.',
        cause: new Error('device unavailable'),
      }),
    )

    expect(() =>
      createProjectMidiImportDraft(
        createImportInput(createMidiDocument(), {
          createInstrumentDevice: () => ({
            device: createInstrumentDeviceWithId(parseDeviceId('different-device')),
            mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT,
          }),
        }),
      ),
    ).toThrowError(
      /^The instrument device factory returned Device different-device for MIDI track 0, not .+\.$/,
    )

    expect(() =>
      createProjectMidiImportDraft(
        createImportInput(createMidiDocument(), {
          createInstrumentDevice: ({ id }) => ({
            appliedInstrumentName: ' ',
            device: createInstrumentDeviceWithId(id),
            mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.APPROXIMATE,
          }),
        }),
      ),
    ).toThrowError('The instrument device factory failed for MIDI track 0.')
  })

  it('wraps Track color factory failures', () => {
    expect(() =>
      createProjectMidiImportDraft(
        createImportInput(createMidiDocument(), {
          createTrackColor: () => {
            throw new Error('palette unavailable')
          },
        }),
      ),
    ).toThrowError('The Track color factory failed for MIDI track 0.')
  })
})
