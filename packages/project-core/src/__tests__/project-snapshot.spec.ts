import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddNoteCommand,
  createInitialProjectSession,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTickDelta,
  parseTimeSignatureEventId,
  type MidiNotePartitionSnapshot,
  type MidiSourceId,
  type NoteId,
  type ProjectSnapshot,
} from '#internal/index'
import { ModelStore, type ModelStoreSeed } from '#internal/model/model-store'
import { createProjectSession } from '#internal/session/project-session'
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

function findPartition(
  snapshot: ProjectSnapshot,
  sourceId: MidiSourceId,
): MidiNotePartitionSnapshot {
  const partition = snapshot.midiNotePartitions.find((candidate) => candidate.sourceId === sourceId)

  if (partition === undefined) throw new Error(`Snapshot has no partition for Source ${sourceId}`)
  return partition
}

function findNote(snapshot: ProjectSnapshot, sourceId: MidiSourceId, noteId: NoteId) {
  return findPartition(snapshot, sourceId).notes.find((note) => note.id === noteId)
}

function reverseMap<Key, Value>(source: ReadonlyMap<Key, Value>): ReadonlyMap<Key, Value> {
  return new Map([...source].reverse())
}

function reverseSeedInsertionOrder(seed: ModelStoreSeed): ModelStoreSeed {
  const midiNotesBySource = new Map(
    [...seed.midiNotesBySource]
      .reverse()
      .map(([sourceId, notes]) => [sourceId, reverseMap(notes)] as const),
  )

  return {
    ...seed,
    tracks: reverseMap(seed.tracks),
    clips: reverseMap(seed.clips),
    midiSources: reverseMap(seed.midiSources),
    midiNotesBySource,
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
      midiNotePartitions: [],
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
    const partition = findPartition(snapshot, fixture.records.nonLoopSource.id)

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
    expect(partition.notes.find((note) => note.id === fixture.records.nonLoopNote.id)).toBe(
      fixture.records.nonLoopNote,
    )
    expect(snapshot.devices[0]).toBe([...fixture.seed.devices.values()].sort(compareIds)[0])

    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.trackOrder)).toBe(true)
    expect(Object.isFrozen(snapshot.tracks)).toBe(true)
    expect(Object.isFrozen(snapshot.clips)).toBe(true)
    expect(Object.isFrozen(snapshot.midiSources)).toBe(true)
    expect(Object.isFrozen(snapshot.midiNotePartitions)).toBe(true)
    expect(Object.isFrozen(snapshot.tempoEvents)).toBe(true)
    expect(Object.isFrozen(snapshot.timeSignatureEvents)).toBe(true)
    expect(Object.isFrozen(snapshot.devices)).toBe(true)
    expect(Object.isFrozen(partition)).toBe(true)
    expect(Object.isFrozen(partition.notes)).toBe(true)
    expect(snapshot.tracks).not.toBeInstanceOf(Map)
    expect(snapshot.midiNotePartitions).not.toBeInstanceOf(Map)
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
    expect(snapshot.midiNotePartitions.map((partition) => partition.sourceId)).toEqual(
      [...fixture.seed.midiNotesBySource.keys()].sort(),
    )

    for (const partition of snapshot.midiNotePartitions) {
      expect(partition.notes).toEqual(
        [...fixture.seed.midiNotesBySource.get(partition.sourceId)!.values()].sort(compareIds),
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

  it('creates fresh containers for repeated snapshots without cloning unchanged Records', () => {
    const { fixture, session } = createFixtureProjectSession()
    const first = session.getSnapshot()
    const second = session.getSnapshot()

    expect(second).not.toBe(first)
    expect(second.trackOrder).not.toBe(first.trackOrder)
    expect(second.tracks).not.toBe(first.tracks)
    expect(second.midiNotePartitions).not.toBe(first.midiNotePartitions)
    expect(second.project).toBe(first.project)
    expect(second.tracks.find((track) => track.id === fixture.records.instrumentTrack.id)).toBe(
      first.tracks.find((track) => track.id === fixture.records.instrumentTrack.id),
    )
    expect(second.modelRevision).toBe(first.modelRevision)
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
