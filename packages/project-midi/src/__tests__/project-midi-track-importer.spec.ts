import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createStandardMidiFileSourceEnvelope } from '@seele-daw/midi-file'
import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_HISTORY_DIRECTION,
  createInitialProjectSession,
  parseProjectId,
  parseProjectColor,
  parseTick,
  parseTempoEventId,
  parseTimeSignatureEventId,
} from '@seele-daw/project-core'
import {
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  ProjectMidiImportError,
  createProjectMidiTrackImportDraft,
  type ProjectMidiImportIdRequest,
  type ProjectMidiTrackColorFactory,
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
    placementTick: parseTick(0),
    createId: shared.createId,
    createInstrumentDevice: shared.createInstrumentDevice,
    createTrackColor: shared.createTrackColor,
    ...overrides,
  }
}

function expectImportError(run: () => unknown, code: ProjectMidiImportError['code']): void {
  expect(run).toThrowError(expect.objectContaining<Partial<ProjectMidiImportError>>({ code }))
}

describe('createProjectMidiTrackImportDraft', () => {
  it('maps note-bearing source Tracks into one atomic collection command', () => {
    const createTrackColor = vi.fn<ProjectMidiTrackColorFactory>(() => parseProjectColor('#4F8CFF'))
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
              controlChanges: [
                { tick: 0, controller: 7, value: 64 },
                { tick: 240, controller: 64, value: 127 },
                { tick: 480, controller: 10, value: 0 },
                { tick: 1_200, controller: 64, value: 0 },
              ],
            }),
          ],
        }),
        { insertAt: 2, createTrackColor },
      ),
    )
    const entry = draft.command.entries[0]
    const clipGraph = entry?.clips[0]

    expect(draft.summary).toEqual({
      sourceFormat: 1,
      sourceEnvelope: createStandardMidiFileSourceEnvelope(1),
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
    expect(entry?.track).toMatchObject({
      color: '#4F8CFF',
      id: 'track-0',
      name: 'Lead',
      channel: { gain: 64 / 127, pan: -1, muted: false, soloed: false },
    })
    expect(entry?.instrumentDevice.id).toBe('device-0')
    expect(clipGraph?.clip).toMatchObject({
      id: 'clip-0',
      trackId: 'track-0',
      startTick: 480,
      spanTick: 3_360,
      sourceId: 'midi-source-0',
      color: null,
    })
    expect(clipGraph?.source).toEqual({ id: 'midi-source-0', lengthTick: 3_360 })
    expect(clipGraph?.notes).toEqual([
      expect.objectContaining({ id: 'midi-note-0', startTick: 480, durationTick: 480 }),
      expect.objectContaining({ id: 'midi-note-1', startTick: 1_440, durationTick: 960 }),
    ])
    expect(clipGraph?.sustainPedalEvents).toEqual([
      { id: 'midi-sustain-pedal-event-0', tick: 0, value: 127, channel: 2 },
      { id: 'midi-sustain-pedal-event-1', tick: 1_920, value: 0, channel: 2 },
    ])
    expect(
      draft.diagnostics.find(
        ({ code }) => code === PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.CONTROL_CHANGES_NOT_IMPORTED,
      ),
    ).toBeUndefined()
    expect(draft.importedTrackIds).toEqual(['track-0'])
    expect(createTrackColor).toHaveBeenCalledWith(
      expect.objectContaining({
        importedTrackIndex: 0,
        sourceTrackIndex: 0,
      }),
    )
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
    expect(draft.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TEMPO_EVENTS_NOT_IMPORTED,
          eventCount: 1,
        }),
        expect.objectContaining({
          code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TIME_SIGNATURE_EVENTS_NOT_IMPORTED,
          eventCount: 1,
        }),
      ]),
    )
  })

  it('maps source file tick zero to one placement anchor without collapsing Track offsets', () => {
    const draft = createProjectMidiTrackImportDraft(
      createTrackImportInput(
        createMidiDocument({
          tracks: [
            createMidiTrack({
              name: 'Early',
              notes: [createMidiNote({ tick: 480 })],
            }),
            createMidiTrack({
              name: 'Late',
              notes: [createMidiNote({ tick: 1_440 })],
            }),
          ],
        }),
        { placementTick: parseTick(7_680) },
      ),
    )

    expect(draft.command.entries.map((entry) => entry.clips[0]?.clip.startTick)).toEqual([
      8_640, 10_560,
    ])
    expect(draft.command.entries.map((entry) => entry.clips[0]?.notes[0]?.startTick)).toEqual([
      0, 0,
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
