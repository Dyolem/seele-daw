import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  ProjectCommandError,
  createAddMidiClipWithNoteCommand,
  createAddMidiSustainPedalEventCommand,
  createAddNoteCommand,
  createInitialProjectSession,
  createMoveMidiSustainPedalEventsCommand,
  createMoveNotesCommand,
  createRemoveMidiSustainPedalEventsCommand,
  createRemoveNotesCommand,
  parseClipId,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTickDelta,
  parseTimeSignatureEventId,
  type MidiSourceId,
  type MidiSustainPedalEventId,
  type NoteId,
  type ProjectSnapshot,
} from '#internal/index'
import { ModelStore, type ModelStoreSeed } from '#internal/model/model-store'
import { createProjectSession } from '#internal/session/project-session'
import { ProjectSnapshots } from '#internal/snapshots/project-snapshot'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { createFixtureProjectSession } from './support/project-session-test-support'

function compareIds(left: { readonly id: string }, right: { readonly id: string }): number {
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

function compareTimelineRecords(
  left: { readonly id: string; readonly tick: number },
  right: { readonly id: string; readonly tick: number },
): number {
  if (left.tick !== right.tick) return left.tick - right.tick
  return compareIds(left, right)
}

function notesOf(snapshot: ProjectSnapshot, sourceId: MidiSourceId) {
  const notes = snapshot.midiNotes[sourceId]

  if (notes === undefined) throw new Error(`Snapshot has no partition for Source ${sourceId}`)
  return notes
}

function findNote(snapshot: ProjectSnapshot, sourceId: MidiSourceId, noteId: NoteId) {
  return notesOf(snapshot, sourceId).find((note) => note.id === noteId)
}

function sustainPedalEventsOf(snapshot: ProjectSnapshot, sourceId: MidiSourceId) {
  const events = snapshot.midiSustainPedalEvents[sourceId]

  if (events === undefined) {
    throw new Error(`Snapshot has no Sustain Pedal Event partition for Source ${sourceId}`)
  }
  return events
}

function findSustainPedalEvent(
  snapshot: ProjectSnapshot,
  sourceId: MidiSourceId,
  eventId: MidiSustainPedalEventId,
) {
  return sustainPedalEventsOf(snapshot, sourceId).find((event) => event.id === eventId)
}

function reverseMap<Key, Value>(source: ReadonlyMap<Key, Value>): ReadonlyMap<Key, Value> {
  return new Map([...source].reverse())
}

function reverseSeedInsertionOrder(seed: ModelStoreSeed): ModelStoreSeed {
  const midiNotes = new Map(
    [...seed.midiNotes]
      .reverse()
      .map(([sourceId, notes]) => [sourceId, reverseMap(notes)] as const),
  )
  const midiSustainPedalEvents = new Map(
    [...seed.midiSustainPedalEvents]
      .reverse()
      .map(([sourceId, events]) => [sourceId, reverseMap(events)] as const),
  )

  return {
    ...seed,
    tracks: reverseMap(seed.tracks),
    clips: reverseMap(seed.clips),
    midiSources: reverseMap(seed.midiSources),
    midiNotes,
    midiSustainPedalEvents,
    tempoEvents: reverseMap(seed.tempoEvents),
    timeSignatureEvents: reverseMap(seed.timeSignatureEvents),
    devices: reverseMap(seed.devices),
  }
}

describe('ProjectSnapshot public contract', () => {
  it('captures the minimal project without exposing the internal factory or Store', () => {
    const session = createInitialProjectSession({
      projectId: parseProjectId('project-snapshot-minimal'),
      projectName: 'Snapshot Minimal',
      tempoEventId: parseTempoEventId('tempo-snapshot-minimal'),
      timeSignatureEventId: parseTimeSignatureEventId('time-signature-snapshot-minimal'),
    })
    const snapshot = session.getSnapshot()

    expectTypeOf(snapshot).toEqualTypeOf<ProjectSnapshot>()
    expect(snapshot).toMatchObject({
      modelRevision: 0,
      project: { id: 'project-snapshot-minimal', name: 'Snapshot Minimal' },
      trackOrder: [],
      tracks: [],
      clips: [],
      midiSources: [],
      midiNotes: {},
      midiSustainPedalEvents: {},
      devices: [],
    })
    expect(snapshot.tempoEvents).toHaveLength(1)
    expect(snapshot.timeSignatureEvents).toHaveLength(1)
    expect('createProjectSnapshot' in projectCore).toBe(false)
    expect('ModelStore' in projectCore).toBe(false)
  })

  it('copies and freezes every public container while sharing domain Records', () => {
    const { fixture, session } = createFixtureProjectSession()
    const snapshot = session.getSnapshot()
    const notes = notesOf(snapshot, fixture.records.nonLoopSource.id)
    const sustainPedalEvents = sustainPedalEventsOf(snapshot, fixture.records.nonLoopSource.id)

    expect(snapshot.project).toBe(fixture.records.project)
    expect(snapshot.master).toBe(fixture.records.master)
    expect(snapshot.tracks.find((track) => track.id === fixture.records.instrumentTrack.id)).toBe(
      fixture.records.instrumentTrack,
    )
    expect(snapshot.clips.find((clip) => clip.id === fixture.records.nonLoopClip.id)).toBe(
      fixture.records.nonLoopClip,
    )
    expect(
      snapshot.midiSources.find((source) => source.id === fixture.records.nonLoopSource.id),
    ).toBe(fixture.records.nonLoopSource)
    expect(notes.find((note) => note.id === fixture.records.nonLoopNote.id)).toBe(
      fixture.records.nonLoopNote,
    )
    expect(
      findSustainPedalEvent(
        snapshot,
        fixture.records.nonLoopSource.id,
        fixture.records.nonLoopPedalDown.id,
      ),
    ).toBe(fixture.records.nonLoopPedalDown)
    expect(snapshot.devices[0]).toBe([...fixture.seed.devices.values()].sort(compareIds)[0])

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.trackOrder)).toBe(true)
    expect(Object.isFrozen(snapshot.tracks)).toBe(true)
    expect(Object.isFrozen(snapshot.clips)).toBe(true)
    expect(Object.isFrozen(snapshot.midiSources)).toBe(true)
    expect(Object.isFrozen(snapshot.midiNotes)).toBe(true)
    expect(Object.isFrozen(snapshot.midiSustainPedalEvents)).toBe(true)
    expect(Object.isFrozen(snapshot.tempoEvents)).toBe(true)
    expect(Object.isFrozen(snapshot.timeSignatureEvents)).toBe(true)
    expect(Object.isFrozen(snapshot.devices)).toBe(true)
    expect(Object.isFrozen(notes)).toBe(true)
    expect(Object.isFrozen(sustainPedalEvents)).toBe(true)
    expect(snapshot.tracks).not.toBeInstanceOf(Map)
    // Partitions have no prototype, so a Source ID such as "constructor" finds nothing inherited.
    expect(Object.getPrototypeOf(snapshot.midiNotes)).toBeNull()
    expect(Object.getPrototypeOf(snapshot.midiSustainPedalEvents)).toBeNull()
  })

  it('uses explicit Track order and deterministic entity and Timeline order', () => {
    const { fixture, session } = createFixtureProjectSession()
    const snapshot = session.getSnapshot()

    expect(snapshot.trackOrder).toEqual(fixture.seed.trackOrder)
    expect(snapshot.tracks).toEqual([...fixture.seed.tracks.values()].sort(compareIds))
    expect(snapshot.clips).toEqual([...fixture.seed.clips.values()].sort(compareIds))
    expect(snapshot.midiSources).toEqual([...fixture.seed.midiSources.values()].sort(compareIds))
    expect(snapshot.devices).toEqual([...fixture.seed.devices.values()].sort(compareIds))
    expect(snapshot.tempoEvents).toEqual(
      [...fixture.seed.tempoEvents.values()].sort(compareTimelineRecords),
    )
    expect(snapshot.timeSignatureEvents).toEqual(
      [...fixture.seed.timeSignatureEvents.values()].sort(compareTimelineRecords),
    )
    expect(Object.keys(snapshot.midiNotes)).toEqual([...fixture.seed.midiNotes.keys()].sort())
    expect(Object.keys(snapshot.midiSustainPedalEvents)).toEqual(
      [...fixture.seed.midiSustainPedalEvents.keys()].sort(),
    )

    for (const [sourceId, partition] of fixture.seed.midiNotes) {
      expect(notesOf(snapshot, sourceId)).toEqual([...partition.values()].sort(compareIds))
    }
    for (const [sourceId, partition] of fixture.seed.midiSustainPedalEvents) {
      expect(sustainPedalEventsOf(snapshot, sourceId)).toEqual(
        [...partition.values()].sort(compareTimelineRecords),
      )
    }
  })

  it('produces equivalent snapshots independently of Map insertion order', () => {
    const fixture = createCompleteProjectFixture()
    const naturalSession = createProjectSession(new ModelStore(fixture.seed))
    const reversedSession = createProjectSession(
      new ModelStore(reverseSeedInsertionOrder(fixture.seed)),
    )

    expect(reversedSession.getSnapshot()).toEqual(naturalSession.getSnapshot())
  })

  it('shares one frozen snapshot per revision', () => {
    const { session } = createFixtureProjectSession()
    const first = session.getSnapshot()

    expect(session.getSnapshot()).toBe(first)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.tracks)).toBe(true)
    expect(Object.isFrozen(first.midiNotes)).toBe(true)
  })
})

describe('ProjectSnapshot revision isolation', () => {
  it('keeps earlier snapshots stable across Add, Move, and Remove commits', () => {
    const { fixture, session } = createFixtureProjectSession()
    const sourceId = fixture.records.nonLoopSource.id
    const noteId = parseNoteId('note-snapshot-versioned')
    const beforeAdd = session.getSnapshot()
    const addResult = session.execute(
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteId,
        startTick: parseTick(1_200),
        durationTick: parseTick(240),
        pitch: parseMidiPitch(72),
        velocity: parseMidiVelocity(100),
        channel: parseMidiChannel(0),
      }),
    )
    const afterAdd = session.getSnapshot()

    expect(addResult.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    expect(findNote(beforeAdd, sourceId, noteId)).toBeUndefined()
    expect(findNote(afterAdd, sourceId, noteId)).toMatchObject({ startTick: 1_200, pitch: 72 })

    session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteIds: [noteId],
        deltaTick: parseTickDelta(240),
        deltaPitch: parseMidiPitchDelta(2),
      }),
    )
    const afterMove = session.getSnapshot()

    expect(findNote(afterAdd, sourceId, noteId)).toMatchObject({ startTick: 1_200, pitch: 72 })
    expect(findNote(afterMove, sourceId, noteId)).toMatchObject({ startTick: 1_440, pitch: 74 })
    expect(findNote(afterMove, sourceId, noteId)).not.toBe(findNote(afterAdd, sourceId, noteId))

    session.execute(
      createRemoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteIds: [noteId],
      }),
    )
    const afterRemove = session.getSnapshot()

    expect(findNote(afterRemove, sourceId, noteId)).toBeUndefined()
    expect(findNote(afterMove, sourceId, noteId)).toMatchObject({ startTick: 1_440, pitch: 74 })
    expect([
      beforeAdd.modelRevision,
      afterAdd.modelRevision,
      afterMove.modelRevision,
      afterRemove.modelRevision,
    ]).toEqual([0, 1, 2, 3])
  })

  it('shares the tables and partitions that commits since the last Snapshot did not touch', () => {
    const { fixture, session } = createFixtureProjectSession()
    const editedSourceId = fixture.records.nonLoopSource.id
    const untouchedSourceId = fixture.records.loopingSource.id
    const noteId = fixture.records.nonLoopNote.id
    const before = session.getSnapshot()
    const moveNote = (deltaTick: number) =>
      session.execute(
        createMoveNotesCommand({
          baseRevision: session.modelRevision,
          sourceId: editedSourceId,
          noteIds: [noteId],
          deltaTick: parseTickDelta(deltaTick),
          deltaPitch: parseMidiPitchDelta(0),
        }),
      )

    // Two commits before the next read; both are accounted for.
    moveNote(240)
    moveNote(240)
    const moved = session.getSnapshot()

    expect(findNote(moved, editedSourceId, noteId)?.startTick).toBe(
      (findNote(before, editedSourceId, noteId)?.startTick ?? 0) + 480,
    )
    expect(notesOf(moved, editedSourceId)).not.toBe(notesOf(before, editedSourceId))
    expect(notesOf(moved, untouchedSourceId)).toBe(notesOf(before, untouchedSourceId))
    expect(moved.midiSustainPedalEvents).toBe(before.midiSustainPedalEvents)
    expect(moved.tracks).toBe(before.tracks)
    expect(moved.clips).toBe(before.clips)
    expect(moved.tempoEvents).toBe(before.tempoEvents)
    expect(moved.trackOrder).toBe(before.trackOrder)

    session.undo()
    session.undo()
    const restored = session.getSnapshot()

    expect(notesOf(restored, editedSourceId)).toEqual(notesOf(before, editedSourceId))
    expect(notesOf(restored, untouchedSourceId)).toBe(notesOf(before, untouchedSourceId))
  })

  it('captures new Undo and Redo revisions while restoring the corresponding Record versions', () => {
    const { fixture, session } = createFixtureProjectSession()
    const sourceId = fixture.records.nonLoopSource.id
    const noteId = fixture.records.nonLoopNote.id
    const beforeMove = session.getSnapshot()
    const originalNote = findNote(beforeMove, sourceId, noteId)

    session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteIds: [noteId],
        deltaTick: parseTickDelta(240),
        deltaPitch: parseMidiPitchDelta(2),
      }),
    )
    const afterMove = session.getSnapshot()
    const movedNote = findNote(afterMove, sourceId, noteId)

    session.undo()
    const afterUndo = session.getSnapshot()
    session.redo()
    const afterRedo = session.getSnapshot()

    expect(originalNote).toBe(fixture.records.nonLoopNote)
    expect(movedNote).not.toBe(originalNote)
    expect(findNote(afterUndo, sourceId, noteId)).toBe(originalNote)
    expect(findNote(afterRedo, sourceId, noteId)).toBe(movedNote)
    expect([
      beforeMove.modelRevision,
      afterMove.modelRevision,
      afterUndo.modelRevision,
      afterRedo.modelRevision,
    ]).toEqual([0, 1, 2, 3])
  })
})

describe('Snapshot partitions merged from written records', () => {
  it('equal a fresh copy after edits, new Sources, Undo and Redo', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const trackId = fixture.records.instrumentTrack.id
    let seed = 7
    const next = (count: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed % count
    }
    const pick = <Value>(values: readonly Value[]): Value | undefined =>
      values.length === 0 ? undefined : values[next(values.length)]
    let created = 0
    const fresh = (prefix: string): string => `${prefix}-merge-${(created += 1)}`
    session.getSnapshot()

    for (let step = 0; step < 400; step += 1) {
      const sourceId = pick([...store.midiSourceEntries()].map(([id]) => id))!
      const noteIds = [...store.midiNoteEntries(sourceId)].map(([id]) => id)
      const eventIds = [...store.midiSustainPedalEventEntries(sourceId)].map(([id]) => id)
      const base = { baseRevision: session.modelRevision, sourceId }
      const noteId = pick(noteIds)
      const eventId = pick(eventIds)
      try {
        switch (next(9)) {
          case 0:
            session.execute(
              createAddNoteCommand({
                ...base,
                noteId: parseNoteId(fresh('note')),
                startTick: parseTick(next(30) * 60),
                durationTick: parseTick(60),
                pitch: parseMidiPitch(48 + next(24)),
                velocity: parseMidiVelocity(100),
                channel: parseMidiChannel(0),
              }),
            )
            break
          case 1:
            if (noteId === undefined) break
            session.execute(
              createMoveNotesCommand({
                ...base,
                noteIds: [noteId],
                deltaTick: parseTickDelta((next(5) - 2) * 60),
                deltaPitch: parseMidiPitchDelta(next(3) - 1),
              }),
            )
            break
          case 2:
            if (noteId !== undefined) {
              session.execute(createRemoveNotesCommand({ ...base, noteIds: [noteId] }))
            }
            break
          case 3:
            session.execute(
              createAddMidiSustainPedalEventCommand({
                ...base,
                eventId: parseMidiSustainPedalEventId(fresh('pedal')),
                tick: parseTick(next(30) * 60),
                value: parseMidiControlValue(next(2) * 127),
                channel: parseMidiChannel(next(2)),
              }),
            )
            break
          case 4:
            if (eventId === undefined) break
            session.execute(
              createMoveMidiSustainPedalEventsCommand({
                ...base,
                eventIds: [eventId],
                deltaTick: parseTickDelta((next(5) - 2) * 60),
              }),
            )
            break
          case 5:
            if (eventId !== undefined) {
              session.execute(
                createRemoveMidiSustainPedalEventsCommand({ ...base, eventIds: [eventId] }),
              )
            }
            break
          case 6:
            session.execute(
              createAddMidiClipWithNoteCommand({
                baseRevision: session.modelRevision,
                clipId: parseClipId(fresh('clip')),
                trackId,
                name: 'Merged',
                color: null,
                muted: false,
                startTick: parseTick(next(8) * 1_920),
                spanTick: parseTick(1_920),
                sourceId: parseMidiSourceId(fresh('source')),
                sourceLengthTick: parseTick(1_920),
                sourceOffsetTick: parseTick(0),
                loop: null,
                noteId: parseNoteId(fresh('note')),
                noteStartTick: parseTick(0),
                noteDurationTick: parseTick(240),
                notePitch: parseMidiPitch(60),
                noteVelocity: parseMidiVelocity(100),
                noteChannel: parseMidiChannel(0),
              }),
            )
            break
          case 7:
            session.undo()
            break
          default:
            session.redo()
        }
      } catch (error) {
        if (!(error instanceof ProjectCommandError)) throw error
      }

      // Several commits may pass between reads; each read merges all of them.
      if (next(3) !== 0) continue
      expect(session.getSnapshot()).toEqual(new ProjectSnapshots().read(store))
    }

    expect(session.getSnapshot()).toEqual(new ProjectSnapshots().read(store))
  })
})
