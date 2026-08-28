import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  DEVICE_DEFINITION_VERSION_MIN,
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  PROJECT_HISTORY_DIRECTION,
  ProjectCommandError,
  createAddInstrumentTrackCollectionCommand,
  createDeviceDescriptor,
  createInstrumentTrackRecord,
  createMidiClipRecord,
  createMidiNoteByIdQuery,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMidiSustainPedalEventRecord,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  parseTrackId,
  type AddInstrumentTrackCollectionCommand,
  type InstrumentTrackCollectionEntry,
} from '#internal/index'
import { prepareProjectCommand } from '#internal/commands/preparation/project-command-preparer'
import { createProjectCommitCandidate } from '#internal/commit/project-commit-candidate'
import { ModelStore } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { requireReadyProjectCommandPlan } from './support/project-command-test-support'
import { createFixtureProjectSession } from './support/project-session-test-support'

function createEntry(
  suffix: string,
  options: {
    readonly noteId?: string
    readonly clipTrackId?: string
    readonly clipSourceId?: string
    readonly midiEffectId?: string
    readonly sustainPedalEventId?: string
  } = {},
): InstrumentTrackCollectionEntry {
  const device = createDeviceDescriptor({
    id: parseDeviceId(`device-import-${suffix}`),
    typeId: parseDeviceTypeId('seele.sample-instrument'),
    definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
    enabled: true,
    parameters: {},
    opaqueState: { soundbankId: 'studio-grand' },
  })
  const track = createInstrumentTrackRecord({
    id: parseTrackId(`track-import-${suffix}`),
    name: `Imported ${suffix}`,
    color: null,
    channel: {
      gain: parseLinearGain(1),
      pan: parseBipolarValue(0),
      muted: false,
      soloed: false,
    },
    midiEffectIds: options.midiEffectId === undefined ? [] : [parseDeviceId(options.midiEffectId)],
    instrumentDeviceId: device.id,
    audioEffectIds: [],
  })
  const source = createMidiSourceRecord({
    id: parseMidiSourceId(`source-import-${suffix}`),
    lengthTick: parseTick(1_920),
  })
  const clip = createMidiClipRecord({
    id: parseClipId(`clip-import-${suffix}`),
    trackId: parseTrackId(options.clipTrackId ?? track.id),
    name: `Imported ${suffix}`,
    color: null,
    muted: false,
    startTick: parseTick(0),
    spanTick: parseTick(1_920),
    sourceId: parseMidiSourceId(options.clipSourceId ?? source.id),
    sourceOffsetTick: parseTick(0),
    loop: null,
  })
  const notes = [
    createMidiNoteRecord({
      id: parseNoteId(options.noteId ?? `note-import-${suffix}-one`),
      startTick: parseTick(0),
      durationTick: parseTick(480),
      pitch: parseMidiPitch(60),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    }),
    createMidiNoteRecord({
      id: parseNoteId(`note-import-${suffix}-two`),
      startTick: parseTick(960),
      durationTick: parseTick(480),
      pitch: parseMidiPitch(64),
      velocity: parseMidiVelocity(96),
      channel: parseMidiChannel(0),
    }),
  ]
  const sustainPedalEvents = [
    createMidiSustainPedalEventRecord({
      id: parseMidiSustainPedalEventId(
        options.sustainPedalEventId ?? `sustain-import-${suffix}-down`,
      ),
      tick: parseTick(120),
      value: parseMidiControlValue(127),
      channel: parseMidiChannel(0),
    }),
    createMidiSustainPedalEventRecord({
      id: parseMidiSustainPedalEventId(`sustain-import-${suffix}-up`),
      tick: parseTick(840),
      value: parseMidiControlValue(0),
      channel: parseMidiChannel(0),
    }),
  ]

  return {
    track,
    instrumentDevice: device,
    clips: [{ clip, source, notes, sustainPedalEvents }],
  }
}

function createCommand(
  store: ModelStore,
  entries: readonly InstrumentTrackCollectionEntry[] = [createEntry('one'), createEntry('two')],
): AddInstrumentTrackCollectionCommand {
  return createAddInstrumentTrackCollectionCommand({
    baseRevision: store.modelRevision,
    entries,
    insertAt: 1,
  })
}

function captureCommandError(operation: () => unknown): ProjectCommandError {
  let caughtError: unknown

  try {
    operation()
  } catch (error) {
    caughtError = error
  }

  expect(caughtError).toBeInstanceOf(ProjectCommandError)
  if (!(caughtError instanceof ProjectCommandError)) {
    throw new Error('Expected a ProjectCommandError')
  }

  return caughtError
}

describe('AddInstrumentTrackCollectionCommand public contract', () => {
  it('normalizes and copies complete Track ownership graphs', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const inputEntry = createEntry('copy')
    const inputEntries = [inputEntry]
    const command = createCommand(store, inputEntries)

    expect(PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD_COLLECTION).toBe(
      'instrument-track.add-collection',
    )
    expect(command.entries).not.toBe(inputEntries)
    expect(command.entries[0]).not.toBe(inputEntry)
    expect(command.entries[0]?.track).toEqual(inputEntry.track)
    expect(command.entries[0]?.clips[0]?.notes).toEqual(inputEntry.clips[0]?.notes)
    expect(command.entries[0]?.clips[0]?.sustainPedalEvents).toEqual(
      inputEntry.clips[0]?.sustainPedalEvents,
    )
    expect(Object.isFrozen(command.entries)).toBe(true)
    expect(Object.isFrozen(command.entries[0]?.clips)).toBe(true)
    expectTypeOf(command).toEqualTypeOf<AddInstrumentTrackCollectionCommand>()
  })

  it('rejects an empty Track collection', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const error = captureCommandError(() => createCommand(store, []))

    expect(error.code).toBe('empty-instrument-track-collection')
  })
})

describe('AddInstrumentTrackCollectionCommand preparation', () => {
  it('plans complete Track and MIDI Clip graphs in deterministic order', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createCommand(store)
    const preparation = prepareProjectCommand(store, command)
    const plan = requireReadyProjectCommandPlan(preparation)
    const [first, second] = command.entries

    expect(plan.forward.map((mutation) => mutation.type)).toEqual([
      PROJECT_MUTATION_TYPE.DEVICE.INSERT,
      PROJECT_MUTATION_TYPE.TRACK.INSERT,
      PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
      PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
      PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
      PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT_PARTITION.INSERT,
      PROJECT_MUTATION_TYPE.CLIP.INSERT,
      PROJECT_MUTATION_TYPE.DEVICE.INSERT,
      PROJECT_MUTATION_TYPE.TRACK.INSERT,
      PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
      PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
      PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
      PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT_PARTITION.INSERT,
      PROJECT_MUTATION_TYPE.CLIP.INSERT,
    ])
    expect(plan.forward[2]).toEqual({
      type: PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
      index: 1,
      trackId: first?.track.id,
    })
    expect(plan.forward[9]).toEqual({
      type: PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
      index: 2,
      trackId: second?.track.id,
    })
    expect(plan.inverse.map((mutation) => mutation.type)).toEqual(
      [...plan.forward].reverse().map((mutation) => {
        switch (mutation.type) {
          case PROJECT_MUTATION_TYPE.DEVICE.INSERT:
            return PROJECT_MUTATION_TYPE.DEVICE.REMOVE
          case PROJECT_MUTATION_TYPE.TRACK.INSERT:
            return PROJECT_MUTATION_TYPE.TRACK.REMOVE
          case PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT:
            return PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE
          case PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT:
            return PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE
          case PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT:
            return PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE
          case PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT_PARTITION.INSERT:
            return PROJECT_MUTATION_TYPE.SUSTAIN_PEDAL_EVENT_PARTITION.REMOVE
          case PROJECT_MUTATION_TYPE.CLIP.INSERT:
            return PROJECT_MUTATION_TYPE.CLIP.REMOVE
          default:
            throw new Error(`Unexpected mutation ${mutation.type}`)
        }
      }),
    )
  })

  it('rejects duplicate identities and invalid ownership before any write', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const existingNote = createEntry('existing-note', {
      noteId: fixture.records.nonLoopNote.id,
    })
    const existingSustainPedalEvent = createEntry('existing-sustain-pedal-event', {
      sustainPedalEventId: fixture.records.nonLoopPedalDown.id,
    })
    const wrongTrack = createEntry('wrong-track', { clipTrackId: 'track-other' })
    const wrongSource = createEntry('wrong-source', { clipSourceId: 'source-other' })
    const unsupportedDeviceChain = createEntry('device-chain', {
      midiEffectId: 'device-unowned-midi-effect',
    })

    expect(
      captureCommandError(() => prepareProjectCommand(store, createCommand(store, [existingNote])))
        .code,
    ).toBe('note-id-already-exists')
    expect(
      captureCommandError(() =>
        prepareProjectCommand(store, createCommand(store, [existingSustainPedalEvent])),
      ).code,
    ).toBe('sustain-pedal-event-id-already-exists')
    expect(
      captureCommandError(() => prepareProjectCommand(store, createCommand(store, [wrongTrack])))
        .code,
    ).toBe('midi-clip-track-kind-mismatch')
    expect(
      captureCommandError(() => prepareProjectCommand(store, createCommand(store, [wrongSource])))
        .code,
    ).toBe('midi-clip-source-id-mismatch')
    expect(
      captureCommandError(() =>
        prepareProjectCommand(store, createCommand(store, [unsupportedDeviceChain])),
      ).code,
    ).toBe('instrument-track-device-chain-unsupported')

    const before = store.modelRevision
    const duplicateEntries = [createEntry('duplicate'), createEntry('duplicate')]
    expect(
      captureCommandError(() =>
        prepareProjectCommand(store, createCommand(store, duplicateEntries)),
      ).code,
    ).toBe('track-id-already-exists')
    expect(store.modelRevision).toBe(before)
  })

  it('binds the aggregate plan to every normalized Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const preparation = prepareProjectCommand(store, createCommand(store))

    if (preparation.status !== 'ready') throw new Error('Expected ready collection command')

    expect(() => createProjectCommitCandidate(createCommand(store), preparation.plan)).toThrowError(
      expect.objectContaining({ code: 'command-plan-mismatch' }),
    )
    expect(() => createProjectCommitCandidate(preparation.command, preparation.plan)).not.toThrow()

    const incompletePlan = createMutationPlan(
      store.modelRevision,
      preparation.plan.forward.slice(0, -1),
    )
    expect(() => createProjectCommitCandidate(preparation.command, incompletePlan)).toThrowError(
      expect.objectContaining({ code: 'unsupported-mutation-type' }),
    )
  })
})

describe('Instrument Track collection commit and History semantics', () => {
  it('commits once, preserves imported MIDI content, and restores the batch through one Undo / Redo', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const initialRevision = session.modelRevision
    const command = createCommand(store)
    const result = session.execute(command)

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected Instrument Track collection to commit')
    }

    expect(session.modelRevision).toBe(initialRevision + 1)
    expect(result.commit.delta.changes.map((change) => change.type)).toEqual([
      PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED,
      PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED,
      PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED,
      PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED,
    ])
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)
    expect(session.getSnapshot().trackOrder).toEqual([
      fixture.records.instrumentTrack.id,
      command.entries[0]?.track.id,
      command.entries[1]?.track.id,
      fixture.records.audioTrack.id,
    ])

    for (const entry of command.entries) {
      const clipGraph = entry.clips[0]
      const note = clipGraph?.notes[0]
      if (clipGraph === undefined || note === undefined) throw new Error('Missing test Note graph')
      const clipChange = result.commit.delta.changes.find(
        (change) =>
          change.type === PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED &&
          change.sourceId === clipGraph.source.id,
      )

      expect(
        session.query(createMidiNoteByIdQuery({ sourceId: clipGraph.source.id, noteId: note.id }))
          .note,
      ).toEqual(note)
      expect(clipChange?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED)
      if (clipChange?.type !== PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED) {
        throw new Error('Missing imported MIDI Clip change')
      }
      expect(clipChange.after.sustainPedalEvents).toEqual(clipGraph.sustainPedalEvents)
      expect(
        [...store.midiSustainPedalEventEntries(clipGraph.source.id)].map(([, event]) => event),
      ).toEqual(clipGraph.sustainPedalEvents)
    }

    const undoCommit = session.undo()
    expect(undoCommit?.origin).toMatchObject({
      direction: PROJECT_HISTORY_DIRECTION.UNDO,
      commandType: PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD_COLLECTION,
    })
    expect(undoCommit?.delta.changes.map((change) => change.type)).toEqual([
      PROJECT_CHANGE_TYPE.MIDI_CLIP.REMOVED,
      PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.REMOVED,
      PROJECT_CHANGE_TYPE.MIDI_CLIP.REMOVED,
      PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.REMOVED,
    ])
    expect(session.getSnapshot().trackOrder).toEqual([
      fixture.records.instrumentTrack.id,
      fixture.records.audioTrack.id,
    ])

    const redoCommit = session.redo()
    expect(redoCommit?.origin).toMatchObject({
      direction: PROJECT_HISTORY_DIRECTION.REDO,
      commandType: PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD_COLLECTION,
    })
    expect(session.getSnapshot().trackOrder).toEqual([
      fixture.records.instrumentTrack.id,
      command.entries[0]?.track.id,
      command.entries[1]?.track.id,
      fixture.records.audioTrack.id,
    ])
  })
})
