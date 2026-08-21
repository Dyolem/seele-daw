import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_HISTORY_DIRECTION,
  createInitialProjectSession,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
} from '@seele-daw/project-core'
import {
  ProjectMidiImportError,
  createProjectMidiTrackImportDraft,
  type ProjectMidiImportIdRequest,
  type ProjectMidiTrackImportDraft,
} from '#internal/index'
import {
  createImportInput,
  createMidiDocument,
  createMidiNote,
  createMidiTrack,
} from '#internal/__tests__/support/project-midi-import-test-support'

function createTrackImportInput(
  document = createMidiDocument(),
  overrides: Partial<Parameters<typeof createProjectMidiTrackImportDraft>[0]> = {},
): Parameters<typeof createProjectMidiTrackImportDraft>[0] {
  const shared = createImportInput(document)

  return {
    document,
    baseRevision: 0 as Parameters<typeof createProjectMidiTrackImportDraft>[0]['baseRevision'],
    insertAt: 0,
    createId: shared.createId,
    createInstrumentDevice: shared.createInstrumentDevice,
    ...overrides,
  }
}

function expectImportError(run: () => unknown, code: ProjectMidiImportError['code']): void {
  expect(run).toThrowError(expect.objectContaining<Partial<ProjectMidiImportError>>({ code }))
}

describe('createProjectMidiTrackImportDraft', () => {
  it('maps note-bearing source Tracks into one atomic collection command', () => {
    const draft = createProjectMidiTrackImportDraft(
      createTrackImportInput(
        createMidiDocument({
          ppq: 480,
          tracks: [
            createMidiTrack({
              name: 'Lead',
              channel: 2,
              endTick: 1_920,
              notes: [
                createMidiNote({ tick: 480, durationTicks: 240, pitch: 64 }),
                createMidiNote({ tick: 960, durationTicks: 480, pitch: 67 }),
              ],
            }),
          ],
        }),
        { insertAt: 2 },
      ),
    )
    const entry = draft.command.entries[0]
    const clipGraph = entry?.clips[0]

    expect(draft.summary).toEqual({
      sourceFormat: 1,
      sourcePpq: 480,
      sourceTrackCount: 1,
      importedTrackCount: 1,
      importedNoteCount: 2,
    })
    expect(draft.command).toMatchObject({
      type: 'instrument-track.add-collection',
      baseRevision: 0,
      insertAt: 2,
    })
    expect(entry?.track).toMatchObject({ id: 'track-0', name: 'Lead' })
    expect(entry?.instrumentDevice.id).toBe('device-0')
    expect(clipGraph?.clip).toMatchObject({
      id: 'clip-0',
      trackId: 'track-0',
      startTick: 960,
      spanTick: 2_880,
      sourceId: 'midi-source-0',
    })
    expect(clipGraph?.source).toEqual({ id: 'midi-source-0', lengthTick: 2_880 })
    expect(clipGraph?.notes).toEqual([
      expect.objectContaining({ id: 'midi-note-0', startTick: 0, durationTick: 480 }),
      expect.objectContaining({ id: 'midi-note-1', startTick: 960, durationTick: 960 }),
    ])
    expect(draft.importedTrackIds).toEqual(['track-0'])
    expect(Object.isFrozen(draft.importedTrackIds)).toBe(true)
    expectTypeOf(draft).toEqualTypeOf<ProjectMidiTrackImportDraft>()
  })

  it('does not allocate, validate, or import source timeline facts', () => {
    const requests: ProjectMidiImportIdRequest[] = []
    const draft = createProjectMidiTrackImportDraft(
      createTrackImportInput(
        createMidiDocument({
          tempos: [{ tick: 0, bpm: 10_000 }],
          timeSignatures: [{ tick: 0, numerator: 99, denominator: 64 }],
        }),
        {
          createId: (request) => {
            requests.push(request)
            return `${request.kind}-${request.ordinal}`
          },
        },
      ),
    )

    expect(draft.command.entries).toHaveLength(1)
    expect(requests.map((request) => request.kind)).toEqual([
      'track',
      'device',
      'clip',
      'midi-source',
      'midi-note',
    ])
  })

  it('rejects a document without note-bearing Tracks', () => {
    expect.hasAssertions()
    expectImportError(
      () =>
        createProjectMidiTrackImportDraft(
          createTrackImportInput(createMidiDocument({ tracks: [createMidiTrack({ notes: [] })] })),
        ),
      'no-importable-tracks',
    )
  })

  it('appends to a Session without replacing Project or timeline facts', () => {
    const session = createInitialProjectSession({
      projectId: parseProjectId('current-project'),
      projectName: 'Current Project',
      tempoEventId: parseTempoEventId('current-tempo'),
      timeSignatureEventId: parseTimeSignatureEventId('current-meter'),
    })
    const before = session.getSnapshot()
    const draft = createProjectMidiTrackImportDraft(
      createTrackImportInput(createMidiDocument(), {
        baseRevision: session.modelRevision,
        insertAt: before.trackOrder.length,
      }),
    )
    const result = session.execute(draft.command)

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected current-Project MIDI Track import to commit')
    }

    const after = session.getSnapshot()
    expect(after.modelRevision).toBe(before.modelRevision + 1)
    expect(after.project).toBe(before.project)
    expect(after.tempoEvents).toEqual(before.tempoEvents)
    expect(after.timeSignatureEvents).toEqual(before.timeSignatureEvents)
    expect(after.trackOrder).toEqual(draft.importedTrackIds)
    expect(result.commit.delta.changes.map((change) => change.type)).toEqual([
      PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED,
      PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED,
    ])

    const undo = session.undo()
    expect(undo?.origin).toMatchObject({ direction: PROJECT_HISTORY_DIRECTION.UNDO })
    expect(session.getSnapshot().trackOrder).toEqual([])
  })
})
