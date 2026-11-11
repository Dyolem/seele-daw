// A Track read model keeps what an edit did not touch: other Clips' read models, and inside the
// edited Clip the projections of untouched Notes. These edit sequences check that the read model
// still equals one built from scratch.
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  ProjectCommandError,
  createAddInstrumentTrackCollectionCommand,
  createAddNoteCommand,
  createDeviceDescriptor,
  createInitialProjectSession,
  createInstrumentTrackRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  createResizeNoteCommand,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTickDelta,
  parseTimeSignatureEventId,
  parseTrackId,
  type MidiSourceId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { createPianoRollTrackReadModel, type PianoRollTrackReadModel } from '#internal/index'

const TRACK_ID = parseTrackId('track-read-model-reuse')
const SOURCE_LENGTH_TICK = 24_000
const NOTES_PER_CLIP = 150

function createSession(): ProjectSession {
  const session = createInitialProjectSession({
    projectId: parseProjectId('project-read-model-reuse'),
    projectName: 'Read model reuse',
    tempoEventId: parseTempoEventId('tempo-read-model-reuse'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-read-model-reuse'),
  })
  const device = createDeviceDescriptor({
    id: parseDeviceId('device-read-model-reuse'),
    typeId: parseDeviceTypeId('test.instrument'),
    definitionVersion: 1,
    enabled: true,
    parameters: {},
    opaqueState: null,
  })
  const track = createInstrumentTrackRecord({
    id: TRACK_ID,
    name: 'Reuse',
    color: null,
    channel: { gain: parseLinearGain(1), pan: parseBipolarValue(0), muted: false, soloed: false },
    instrumentDeviceId: device.id,
  })
  const clips = [0, 1].map((clipIndex) => {
    const source = createMidiSourceRecord({
      id: parseMidiSourceId(`source-read-model-reuse-${clipIndex}`),
      lengthTick: parseTick(SOURCE_LENGTH_TICK),
    })
    return {
      clip: createMidiClipRecord({
        id: parseClipId(`clip-read-model-reuse-${clipIndex}`),
        trackId: TRACK_ID,
        name: `Clip ${clipIndex}`,
        color: null,
        muted: false,
        startTick: parseTick(clipIndex * SOURCE_LENGTH_TICK),
        spanTick: parseTick(SOURCE_LENGTH_TICK - 960),
        sourceId: source.id,
        sourceOffsetTick: parseTick(480),
      }),
      source,
      notes: Array.from({ length: NOTES_PER_CLIP }, (_, noteIndex) =>
        createMidiNoteRecord({
          id: parseNoteId(`note-read-model-reuse-${clipIndex}-${noteIndex}`),
          startTick: parseTick(noteIndex * 150),
          durationTick: parseTick(240 + (noteIndex % 4) * 120),
          pitch: parseMidiPitch(40 + (noteIndex % 30)),
          velocity: parseMidiVelocity(100),
          channel: parseMidiChannel(0),
        }),
      ),
      sustainPedalEvents: [],
    }
  })
  const result = session.execute(
    createAddInstrumentTrackCollectionCommand({
      baseRevision: session.modelRevision,
      entries: [{ track, instrumentDevice: device, clips }],
      insertAt: 0,
    }),
  )
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) throw new Error('No import')
  return session
}

function readModel(session: ProjectSession): PianoRollTrackReadModel {
  return createPianoRollTrackReadModel({ snapshot: session.getSnapshot(), trackId: TRACK_ID })
}

/** Fresh objects share nothing with earlier builds, so this is the read model built from scratch. */
function readModelFromScratch(session: ProjectSession): PianoRollTrackReadModel {
  return createPianoRollTrackReadModel({
    snapshot: structuredClone(session.getSnapshot()),
    trackId: TRACK_ID,
  })
}

describe('Track read model reuse', () => {
  it('keeps other Clips, and the other Notes of the edited Clip, when one Note moves', () => {
    const session = createSession()
    const before = readModel(session)
    const noteId = parseNoteId('note-read-model-reuse-0-70')

    session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId: parseMidiSourceId('source-read-model-reuse-0'),
        noteIds: [noteId],
        deltaTick: parseTickDelta(30),
        deltaPitch: parseMidiPitchDelta(0),
      }),
    )
    const after = readModel(session)
    const previousNotes = new Set(before.clips[0]!.notes)

    expect(after.clips[1]).toBe(before.clips[1])
    expect(after.clips[0]!.clip).toBe(before.clips[0]!.clip)
    expect(
      after.clips[0]!.notes.filter((note) => !previousNotes.has(note)).map(({ note }) => note.id),
    ).toEqual([noteId])
    expect(after).toEqual(readModelFromScratch(session))
  })

  it('equals a read model built from scratch after every edit, Undo and Redo', () => {
    const session = createSession()
    const sourceIds: MidiSourceId[] = [
      parseMidiSourceId('source-read-model-reuse-0'),
      parseMidiSourceId('source-read-model-reuse-1'),
    ]
    let seed = 29
    const next = (count: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed % count
    }
    let created = 0
    readModel(session)

    for (let step = 0; step < 300; step += 1) {
      const sourceId = sourceIds[next(sourceIds.length)]!
      const notes = session.getSnapshot().midiNotes[sourceId] ?? []
      const note = notes.length === 0 ? undefined : notes[next(notes.length)]
      const base = { baseRevision: session.modelRevision, sourceId }
      try {
        switch (next(7)) {
          case 0:
            session.execute(
              createAddNoteCommand({
                ...base,
                noteId: parseNoteId(`note-read-model-added-${(created += 1)}`),
                startTick: parseTick(next(SOURCE_LENGTH_TICK / 60 - 8) * 60),
                durationTick: parseTick(60 * (1 + next(8))),
                pitch: parseMidiPitch(40 + next(30)),
                velocity: parseMidiVelocity(1 + next(127)),
                channel: parseMidiChannel(0),
              }),
            )
            break
          case 1:
            if (note === undefined) break
            session.execute(
              createMoveNotesCommand({
                ...base,
                noteIds: [note.id],
                deltaTick: parseTickDelta((next(9) - 4) * 120),
                deltaPitch: parseMidiPitchDelta(next(3) - 1),
              }),
            )
            break
          case 2:
            if (note === undefined) break
            session.execute(
              createResizeNoteCommand({
                ...base,
                noteId: note.id,
                startTick: note.startTick,
                durationTick: parseTick(60 * (1 + next(12))),
              }),
            )
            break
          case 3:
            if (note !== undefined) {
              session.execute(createRemoveNotesCommand({ ...base, noteIds: [note.id] }))
            }
            break
          case 4:
            session.undo()
            break
          case 5:
            session.redo()
            break
          default:
            // Several edits may land between two builds.
            continue
        }
      } catch (error) {
        if (!(error instanceof ProjectCommandError)) throw error
      }

      if (next(2) !== 0) continue
      expect(readModel(session)).toEqual(readModelFromScratch(session))
    }
  })
})
