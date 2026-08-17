import {
  DEVICE_DEFINITION_VERSION_MIN,
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddInstrumentTrackCommand,
  createAddMidiClipCommand,
  createAddNoteCommand,
  createInitialProjectSession,
  createMidiNoteByIdQuery,
  createMoveNotesCommand,
  createRemoveNotesCommand,
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
  type MidiChannel,
  type MidiPitch,
  type MidiVelocity,
  type NoteId,
  type ProjectCommand,
  type ProjectSession,
  type Tick,
} from '@seele-daw/project-core'

import { createPianoRollClipContext } from '#internal/index'

function executeCommitted(session: ProjectSession, command: ProjectCommand): void {
  const result = session.execute(command)
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error(`Expected ${command.type} to commit in Piano Roll test support`)
  }
}

export interface AddFixtureNoteInput {
  readonly channel?: MidiChannel
  readonly durationTick: Tick
  readonly noteId: NoteId
  readonly pitch: MidiPitch
  readonly startTick: Tick
  readonly velocity?: MidiVelocity
}

/** Creates one public-API Project graph with a non-looped, offset MIDI Clip. */
export function createPianoRollProjectFixture() {
  const projectId = parseProjectId('editor-piano-roll-project')
  const trackId = parseTrackId('editor-piano-roll-track')
  const clipId = parseClipId('editor-piano-roll-clip')
  const sourceId = parseMidiSourceId('editor-piano-roll-source')
  const session = createInitialProjectSession({
    projectId,
    projectName: 'Editor Piano Roll',
    tempoEventId: parseTempoEventId('editor-piano-roll-tempo'),
    timeSignatureEventId: parseTimeSignatureEventId('editor-piano-roll-meter'),
  })

  executeCommitted(
    session,
    createAddInstrumentTrackCommand({
      baseRevision: session.modelRevision,
      trackId,
      name: 'Instrument 1',
      color: null,
      channel: {
        gain: parseLinearGain(1),
        pan: parseBipolarValue(0),
        muted: false,
        soloed: false,
      },
      instrumentDevice: {
        id: parseDeviceId('editor-piano-roll-device'),
        typeId: parseDeviceTypeId('seele.instrument-slot'),
        definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
        enabled: true,
        parameters: {},
        opaqueState: null,
      },
      insertAt: 0,
    }),
  )
  executeCommitted(
    session,
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId,
      trackId,
      name: 'Instrument 1',
      color: null,
      muted: false,
      startTick: parseTick(0),
      spanTick: parseTick(1_920),
      sourceId,
      sourceLengthTick: parseTick(3_840),
      sourceOffsetTick: parseTick(480),
      loop: null,
    }),
  )

  function addNote(input: AddFixtureNoteInput): void {
    executeCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteId: input.noteId,
        startTick: input.startTick,
        durationTick: input.durationTick,
        pitch: input.pitch,
        velocity: input.velocity ?? parseMidiVelocity(100),
        channel: input.channel ?? parseMidiChannel(0),
      }),
    )
  }

  function moveNote(noteId: NoteId, nextStartTick: Tick, nextPitch: MidiPitch): void {
    const before = session.query(createMidiNoteByIdQuery({ sourceId, noteId })).note
    if (before === undefined) throw new Error(`Expected MIDI Note ${noteId}`)

    executeCommitted(
      session,
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteIds: [noteId],
        deltaTick: parseTickDelta(nextStartTick - before.startTick),
        deltaPitch: parseMidiPitchDelta(nextPitch - before.pitch),
      }),
    )
  }

  function removeNote(noteId: NoteId): void {
    executeCommitted(
      session,
      createRemoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteIds: [noteId],
      }),
    )
  }

  addNote({
    noteId: parseNoteId('editor-note-leading'),
    startTick: parseTick(240),
    durationTick: parseTick(480),
    pitch: parseMidiPitch(60),
  })
  addNote({
    noteId: parseNoteId('editor-note-inside'),
    startTick: parseTick(960),
    durationTick: parseTick(240),
    pitch: parseMidiPitch(64),
  })
  addNote({
    noteId: parseNoteId('editor-note-high'),
    startTick: parseTick(1_000),
    durationTick: parseTick(240),
    pitch: parseMidiPitch(90),
  })
  addNote({
    noteId: parseNoteId('editor-note-after-clip'),
    startTick: parseTick(2_880),
    durationTick: parseTick(240),
    pitch: parseMidiPitch(67),
  })

  const snapshot = session.getSnapshot()
  const clip = snapshot.clips.find((candidate) => candidate.id === clipId)
  const source = snapshot.midiSources.find((candidate) => candidate.id === sourceId)
  if (clip === undefined || source === undefined) {
    throw new Error('Piano Roll fixture Clip graph is incomplete')
  }

  return Object.freeze({
    addNote,
    clip,
    context: createPianoRollClipContext(clip, source),
    moveNote,
    removeNote,
    session,
    source,
  })
}
