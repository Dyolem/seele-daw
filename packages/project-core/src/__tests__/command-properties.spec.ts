import { describe, expect, it } from 'vitest'

import {
  DEVICE_DEFINITION_VERSION_MIN,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  createAddInstrumentTrackCollectionCommand,
  createAddInstrumentTrackCommand,
  createAddMidiClipCommand,
  createAddMidiClipWithNoteCommand,
  createAddMidiSustainPedalEventCommand,
  createAddNoteCommand,
  createAddTempoEventCommand,
  createDeviceDescriptor,
  createExtendMidiClipWithNoteCommand,
  createInstrumentTrackRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMoveMidiSustainPedalEventsCommand,
  createMoveNotesCommand,
  createMoveTempoEventCommand,
  createRemoveMidiSustainPedalEventsCommand,
  createRemoveNotesCommand,
  createRemoveTempoEventCommand,
  createReplaceInstrumentDeviceCommand,
  createReplaceMidiSustainPedalEventValueCommand,
  createReplaceTempoEventBpmCommand,
  createResizeNoteCommand,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseMidiVelocity,
  parseNoteId,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  parseTickDelta,
  parseTrackId,
  type ProjectCommand,
  type ProjectCommandType,
  type ProjectSession,
  type ProjectSnapshot,
} from '#internal/index'
import { describeChanges } from './support/project-change-test-support'
import { createFixtureProjectSession } from './support/project-session-test-support'

const NON_LOOP_SOURCE = parseMidiSourceId('source-verse')
const CHANNEL = { gain: parseLinearGain(1), pan: parseBipolarValue(0), muted: false, soloed: false }

function instrument(id: string) {
  return {
    id: parseDeviceId(id),
    typeId: parseDeviceTypeId('seele.sample-instrument'),
    definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
    enabled: true,
    parameters: {},
    opaqueState: { soundbankId: 'studio-grand' },
  }
}

function note(id: string, startTick: number) {
  return {
    noteId: parseNoteId(id),
    noteStartTick: parseTick(startTick),
    noteDurationTick: parseTick(120),
    notePitch: parseMidiPitch(70),
    noteVelocity: parseMidiVelocity(90),
    noteChannel: parseMidiChannel(0),
  }
}

function collectionEntry() {
  const device = createDeviceDescriptor(instrument('device-collection'))
  const track = createInstrumentTrackRecord({
    id: parseTrackId('track-collection'),
    name: 'Imported',
    color: null,
    channel: CHANNEL,
    instrumentDeviceId: device.id,
  })
  const source = createMidiSourceRecord({
    id: parseMidiSourceId('source-collection'),
    lengthTick: parseTick(960),
  })
  const clip = createMidiClipRecord({
    id: parseClipId('clip-collection'),
    trackId: track.id,
    name: 'Imported',
    color: null,
    muted: false,
    startTick: parseTick(0),
    spanTick: parseTick(960),
    sourceId: source.id,
    sourceOffsetTick: parseTick(0),
  })
  const notes = [
    createMidiNoteRecord({
      id: parseNoteId('note-collection'),
      startTick: parseTick(0),
      durationTick: parseTick(240),
      pitch: parseMidiPitch(60),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    }),
  ]
  return {
    track,
    instrumentDevice: device,
    clips: [{ clip, source, notes, sustainPedalEvents: [] }],
  }
}

interface CommandCase {
  readonly type: ProjectCommandType
  readonly command: (session: ProjectSession) => ProjectCommand
  /** Every storage change the command makes, in order, as "table.op address". */
  readonly changes: readonly string[]
}

const CASES: readonly CommandCase[] = [
  {
    type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD,
    command: ({ modelRevision }) =>
      createAddTempoEventCommand({
        baseRevision: modelRevision,
        tempoEventId: parseTempoEventId('tempo-added'),
        tick: parseTick(1_920),
        bpm: parseTempoBpm(96),
      }),
    changes: ['tempoEvents.insert tempo-added'],
  },
  {
    type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE,
    command: ({ modelRevision }) =>
      createMoveTempoEventCommand({
        baseRevision: modelRevision,
        tempoEventId: parseTempoEventId('tempo-later'),
        tick: parseTick(4_800),
      }),
    changes: ['tempoEvents.replace tempo-later'],
  },
  {
    type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REMOVE,
    command: ({ modelRevision }) =>
      createRemoveTempoEventCommand({
        baseRevision: modelRevision,
        tempoEventId: parseTempoEventId('tempo-later'),
      }),
    changes: ['tempoEvents.remove tempo-later'],
  },
  {
    type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM,
    command: ({ modelRevision }) =>
      createReplaceTempoEventBpmCommand({
        baseRevision: modelRevision,
        tempoEventId: parseTempoEventId('tempo-initial'),
        bpm: parseTempoBpm(133),
      }),
    changes: ['tempoEvents.replace tempo-initial'],
  },
  {
    type: PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE,
    command: ({ modelRevision }) =>
      createReplaceInstrumentDeviceCommand({
        baseRevision: modelRevision,
        trackId: parseTrackId('track-instrument'),
        instrumentDevice: instrument('device-instrument'),
      }),
    changes: ['devices.replace device-instrument'],
  },
  {
    type: PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD,
    command: ({ modelRevision }) =>
      createAddInstrumentTrackCommand({
        baseRevision: modelRevision,
        trackId: parseTrackId('track-added'),
        name: 'Added',
        color: null,
        channel: CHANNEL,
        instrumentDevice: instrument('device-added'),
        insertAt: 0,
      }),
    changes: [
      'devices.insert device-added',
      'tracks.insert track-added',
      'trackOrder.insert track-added',
    ],
  },
  {
    type: PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD_COLLECTION,
    command: ({ modelRevision }) =>
      createAddInstrumentTrackCollectionCommand({
        baseRevision: modelRevision,
        entries: [collectionEntry()],
        insertAt: 1,
      }),
    changes: [
      'devices.insert device-collection',
      'tracks.insert track-collection',
      'trackOrder.insert track-collection',
      'midiSources.insert source-collection',
      'midiNotes.insert-partition source-collection',
      'midiSustainPedalEvents.insert-partition source-collection',
      'clips.insert clip-collection',
    ],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD,
    command: ({ modelRevision }) =>
      createAddMidiClipCommand({
        baseRevision: modelRevision,
        clipId: parseClipId('clip-added'),
        trackId: parseTrackId('track-instrument'),
        name: 'Added',
        color: null,
        muted: false,
        startTick: parseTick(7_680),
        spanTick: parseTick(960),
        sourceId: parseMidiSourceId('source-added'),
        sourceLengthTick: parseTick(960),
        sourceOffsetTick: parseTick(0),
      }),
    changes: [
      'midiSources.insert source-added',
      'midiNotes.insert-partition source-added',
      'midiSustainPedalEvents.insert-partition source-added',
      'clips.insert clip-added',
    ],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE,
    command: ({ modelRevision }) =>
      createAddMidiClipWithNoteCommand({
        baseRevision: modelRevision,
        clipId: parseClipId('clip-added-with-note'),
        trackId: parseTrackId('track-instrument'),
        name: 'Added',
        color: null,
        muted: false,
        startTick: parseTick(7_680),
        spanTick: parseTick(960),
        sourceId: parseMidiSourceId('source-added-with-note'),
        sourceLengthTick: parseTick(960),
        sourceOffsetTick: parseTick(0),
        ...note('note-in-added-clip', 0),
      }),
    changes: [
      'midiSources.insert source-added-with-note',
      'midiNotes.insert-partition source-added-with-note',
      'midiSustainPedalEvents.insert-partition source-added-with-note',
      'clips.insert clip-added-with-note',
    ],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE,
    command: ({ modelRevision }) =>
      createExtendMidiClipWithNoteCommand({
        baseRevision: modelRevision,
        clipId: parseClipId('clip-verse'),
        spanTick: parseTick(1_440),
        ...note('note-in-extension', 1_300),
      }),
    changes: ['clips.replace clip-verse', 'midiNotes.insert note-in-extension'],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
    command: ({ modelRevision }) =>
      createAddNoteCommand({
        baseRevision: modelRevision,
        sourceId: NON_LOOP_SOURCE,
        noteId: parseNoteId('note-added'),
        startTick: parseTick(1_000),
        durationTick: parseTick(120),
        pitch: parseMidiPitch(72),
        velocity: parseMidiVelocity(80),
        channel: parseMidiChannel(0),
      }),
    changes: ['midiNotes.insert note-added'],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE,
    command: ({ modelRevision }) =>
      createMoveNotesCommand({
        baseRevision: modelRevision,
        sourceId: NON_LOOP_SOURCE,
        noteIds: [parseNoteId('note-verse-primary'), parseNoteId('note-verse-harmony')],
        deltaTick: parseTickDelta(10),
        deltaPitch: parseMidiPitchDelta(1),
      }),
    changes: ['midiNotes.replace note-verse-primary', 'midiNotes.replace note-verse-harmony'],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE,
    command: ({ modelRevision }) =>
      createRemoveNotesCommand({
        baseRevision: modelRevision,
        sourceId: NON_LOOP_SOURCE,
        noteIds: [parseNoteId('note-verse-harmony')],
      }),
    changes: ['midiNotes.remove note-verse-harmony'],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE,
    command: ({ modelRevision }) =>
      createResizeNoteCommand({
        baseRevision: modelRevision,
        sourceId: NON_LOOP_SOURCE,
        noteId: parseNoteId('note-verse-primary'),
        startTick: parseTick(240),
        durationTick: parseTick(300),
      }),
    changes: ['midiNotes.replace note-verse-primary'],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD,
    command: ({ modelRevision }) =>
      createAddMidiSustainPedalEventCommand({
        baseRevision: modelRevision,
        sourceId: NON_LOOP_SOURCE,
        eventId: parseMidiSustainPedalEventId('sustain-added'),
        tick: parseTick(1_000),
        value: parseMidiControlValue(127),
        channel: parseMidiChannel(0),
      }),
    changes: ['midiSustainPedalEvents.insert sustain-added'],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.MOVE,
    command: ({ modelRevision }) =>
      createMoveMidiSustainPedalEventsCommand({
        baseRevision: modelRevision,
        sourceId: NON_LOOP_SOURCE,
        eventIds: [parseMidiSustainPedalEventId('sustain-verse-up')],
        deltaTick: parseTickDelta(10),
      }),
    changes: ['midiSustainPedalEvents.replace sustain-verse-up'],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVE,
    command: ({ modelRevision }) =>
      createRemoveMidiSustainPedalEventsCommand({
        baseRevision: modelRevision,
        sourceId: NON_LOOP_SOURCE,
        eventIds: [parseMidiSustainPedalEventId('sustain-verse-up')],
      }),
    changes: ['midiSustainPedalEvents.remove sustain-verse-up'],
  },
  {
    type: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REPLACE_VALUE,
    command: ({ modelRevision }) =>
      createReplaceMidiSustainPedalEventValueCommand({
        baseRevision: modelRevision,
        sourceId: NON_LOOP_SOURCE,
        eventId: parseMidiSustainPedalEventId('sustain-verse-down'),
        value: parseMidiControlValue(100),
      }),
    changes: ['midiSustainPedalEvents.replace sustain-verse-down'],
  },
]

/** Everything a snapshot holds except the revision, which every commit, undo or redo advances. */
function facts(snapshot: ProjectSnapshot) {
  const { modelRevision: _revision, ...rest } = snapshot
  return rest
}

describe('Every Project command', () => {
  it('has a case here', () => {
    const types = Object.values(PROJECT_COMMAND_TYPE).flatMap((group) => Object.values(group))
    expect(CASES.map(({ type }) => type).sort()).toEqual([...types].sort())
  })

  it.each(CASES)('$type makes exactly its changes, and undo and redo replay it exactly', (spec) => {
    const { session } = createFixtureProjectSession()
    const before = facts(session.getSnapshot())

    const result = session.execute(spec.command(session))
    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error(`Expected ${spec.type} to commit, got ${result.status}`)
    }
    const after = facts(session.getSnapshot())
    expect(describeChanges(result.commit)).toEqual(spec.changes)
    expect(after).not.toEqual(before)

    session.undo()
    expect(facts(session.getSnapshot())).toEqual(before)
    session.redo()
    expect(facts(session.getSnapshot())).toEqual(after)
  })
})
