import { describe, expect, it } from 'vitest'
import { createStandardMidiFileSourceEnvelope } from '@seele-daw/midi-file'
import { parseDeviceId } from '@seele-daw/project-core'
import {
  PROJECT_MIDI_INSTRUMENT_MAPPING_KIND,
  ProjectMidiImportError,
  createProjectMidiImportDraft,
} from '#internal/index'
import {
  createImportInput,
  createInstrumentDeviceWithId,
  createMidiDocument,
  createMidiNote,
  createMidiTrack,
} from '#internal/__tests__/support/project-midi-import-test-support'

function expectImportError(run: () => unknown, code: ProjectMidiImportError['code']): void {
  expect(run).toThrowError(expect.objectContaining<Partial<ProjectMidiImportError>>({ code }))
}

describe('Project MIDI import failures', () => {
  it('rejects a missing or inconsistent MIDI Source Envelope', () => {
    expect.hasAssertions()
    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(
            createMidiDocument({
              sourceEnvelope: undefined as never,
            }),
          ),
        ),
      'invalid-midi-document',
    )
    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(
            createMidiDocument({
              sourceEnvelope: createStandardMidiFileSourceEnvelope(0),
            }),
          ),
        ),
      'invalid-midi-document',
    )
  })

  it('rejects source PPQ outside the Standard MIDI File range', () => {
    expect.hasAssertions()
    expectImportError(
      () => createProjectMidiImportDraft(createImportInput(createMidiDocument({ ppq: 0 }))),
      'invalid-midi-document',
    )
  })

  it('rejects tick conversion beyond the Project safe-integer range', () => {
    expect.hasAssertions()
    expectImportError(
      () =>
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
      'tick-conversion-overflow',
    )
  })

  it('rejects malformed sustain-pedal values before creating Project facts', () => {
    expect.hasAssertions()
    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(
            createMidiDocument({
              tracks: [
                createMidiTrack({
                  controlChanges: [{ tick: 0, controller: 64, value: 128 }],
                }),
              ],
            }),
          ),
        ),
      'invalid-midi-document',
    )
  })

  it('rejects malformed initial Channel controls before creating Project facts', () => {
    expect.hasAssertions()
    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(
            createMidiDocument({
              tracks: [
                createMidiTrack({
                  controlChanges: [{ tick: 0, controller: 7, value: 128 }],
                }),
              ],
            }),
          ),
        ),
      'invalid-midi-document',
    )
  })

  it.each([4.99, 999.01])('rejects tempo %s outside the current Project model range', (bpm) => {
    expect.hasAssertions()
    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(createMidiDocument({ tempos: [{ tick: 0, bpm }] })),
        ),
      'unsupported-tempo',
    )
  })

  it('rejects time signatures outside the current Project model domain', () => {
    expect.hasAssertions()
    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(
            createMidiDocument({
              timeSignatures: [{ tick: 0, numerator: 3, denominator: 64 }],
            }),
          ),
        ),
      'unsupported-time-signature',
    )
  })

  it('rejects invalid and duplicate generated IDs with stable codes', () => {
    expect.hasAssertions()
    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(createMidiDocument(), { createId: () => ' ' }),
        ),
      'identity-factory-failed',
    )

    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(
            createMidiDocument({
              tracks: [
                createMidiTrack({ notes: [createMidiNote(), createMidiNote({ pitch: 61 })] }),
              ],
            }),
            {
              createId: ({ kind, ordinal }) =>
                kind === 'midi-note' ? 'duplicate-note' : `${kind}-${ordinal}`,
            },
          ),
        ),
      'duplicate-generated-id',
    )
  })

  it('wraps thrown or mismatched instrument device factories', () => {
    expect.hasAssertions()
    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(createMidiDocument(), {
            createInstrumentDevice: () => {
              throw new Error('device unavailable')
            },
          }),
        ),
      'instrument-device-factory-failed',
    )

    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(createMidiDocument(), {
            createInstrumentDevice: () => ({
              device: createInstrumentDeviceWithId(parseDeviceId('different-device')),
              mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT,
            }),
          }),
        ),
      'instrument-device-factory-failed',
    )

    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(createMidiDocument(), {
            createInstrumentDevice: ({ id }) => ({
              appliedInstrumentName: ' ',
              device: createInstrumentDeviceWithId(id),
              mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.APPROXIMATE,
            }),
          }),
        ),
      'instrument-device-factory-failed',
    )
  })

  it('wraps Track color factory failures', () => {
    expect.hasAssertions()
    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(createMidiDocument(), {
            createTrackColor: () => {
              throw new Error('palette unavailable')
            },
          }),
        ),
      'track-color-factory-failed',
    )
  })

  it('wraps values rejected by the complete Project loading boundary', () => {
    expect.hasAssertions()
    expectImportError(
      () =>
        createProjectMidiImportDraft(
          createImportInput(
            createMidiDocument({
              tracks: [createMidiTrack({ notes: [createMidiNote({ pitch: 128 })] })],
            }),
          ),
        ),
      'project-validation-failed',
    )
  })
})
