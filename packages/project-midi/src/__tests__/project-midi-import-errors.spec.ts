import { describe, expect, it } from 'vitest'
import { parseDeviceId } from '@seele-daw/project-core'
import { ProjectMidiImportError, createProjectMidiImportDraft } from '#internal/index'
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
            createInstrumentDevice: () =>
              createInstrumentDeviceWithId(parseDeviceId('different-device')),
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
