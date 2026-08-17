import { PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION } from '@seele-daw/editor'
import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  ProjectCommandError,
  createAddMidiClipCommand,
  createInitialProjectSession,
  parseClipId,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseNoteId,
  parsePositiveTick,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTickDelta,
  parseTimeSignatureEventId,
  type ClipId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import { createProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import {
  PROJECT_MIDI_NOTE_DEFAULT_CHANNEL,
  PROJECT_MIDI_NOTE_DEFAULT_VELOCITY,
  createProjectMidiNoteCoordinator,
} from '@/workbench/project/midi-note/project-midi-note-coordinator'
import { ProjectMidiNoteError } from '@/workbench/project/midi-note/project-midi-note-error'

function createSession(suffix: string): ProjectSession {
  return createInitialProjectSession({
    projectId: parseProjectId(`project-midi-note-${suffix}`),
    projectName: `MIDI Note ${suffix}`,
    tempoEventId: parseTempoEventId(`tempo-midi-note-${suffix}`),
    timeSignatureEventId: parseTimeSignatureEventId(`meter-midi-note-${suffix}`),
  })
}

function createReadyState(session: ProjectSession): ReadyActiveProjectState {
  const snapshot = session.getSnapshot()

  return Object.freeze({
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId: snapshot.project.id,
    session,
    modelRevision: session.modelRevision,
    contentStateId: session.contentStateId,
    savedRevision: session.modelRevision,
    savedContentStateId: session.contentStateId,
    isDirty: false,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    saveFailure: null,
    recoveryFailures: Object.freeze([]),
  })
}

function createIdentitySource(...identities: string[]): () => string {
  let index = 0

  return () => {
    const identity = identities[index]
    if (identity === undefined) throw new Error('Test identity source exhausted')
    index += 1
    return identity
  }
}

interface MidiClipFixture {
  readonly clipId: ClipId
  readonly readyState: ReadyActiveProjectState
  readonly session: ProjectSession
}

function createMidiClipFixture(
  suffix: string,
  options: {
    readonly looped?: boolean
    readonly sourceOffsetTick?: number
    readonly spanTick?: number
  } = {},
): MidiClipFixture {
  const session = createSession(suffix)
  const readyState = createReadyState(session)
  const track = createProjectTrackCoordinator({
    activeProject: { state: readyState },
    createUniqueId: createIdentitySource(`track-midi-note-${suffix}`, `device-midi-note-${suffix}`),
    createRandomValue: () => 0,
  }).addInstrumentTrack()
  const clipId = parseClipId(`clip-midi-note-${suffix}`)
  const sourceId = parseMidiSourceId(`source-midi-note-${suffix}`)
  const spanTick = parsePositiveTick(options.spanTick ?? 960)
  const sourceOffsetTick = parseTick(options.sourceOffsetTick ?? 480)
  const sourceLengthTick = parsePositiveTick(options.looped ? 960 : sourceOffsetTick + spanTick)
  const result = session.execute(
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId,
      trackId: track.trackId,
      name: `Clip ${suffix}`,
      color: null,
      muted: false,
      startTick: parseTick(0),
      spanTick,
      sourceId,
      sourceLengthTick,
      sourceOffsetTick: options.looped ? parseTick(0) : sourceOffsetTick,
      loop: options.looped
        ? {
            sourceStartTick: parseTick(0),
            sourceSpanTick: parsePositiveTick(960),
          }
        : null,
    }),
  )

  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Test MIDI Clip creation unexpectedly produced no change')
  }

  return { clipId, readyState, session }
}

function noteRecords(session: ProjectSession) {
  return session.getSnapshot().midiNotePartitions.flatMap(({ notes }) => notes)
}

describe('ProjectMidiNoteCoordinator', () => {
  it('adds one Note with product defaults and maps Clip-local time into its MidiSource', () => {
    const fixture = createMidiClipFixture('defaults')
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: () => 'note-midi-note-defaults',
    })
    const result = coordinator.addMidiNote({
      clipId: fixture.clipId,
      clipStartTick: parseTick(120),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
    })
    const note = noteRecords(fixture.session)[0]

    expect(Object.isFrozen(coordinator)).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(result.noteId).toBe('note-midi-note-defaults')
    expect(result.commit.origin).toEqual({
      kind: 'command',
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
    })
    expect(result.commit.delta.changes[0]?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED)
    expect(note).toEqual({
      id: 'note-midi-note-defaults',
      startTick: 600,
      durationTick: 240,
      pitch: 60,
      velocity: PROJECT_MIDI_NOTE_DEFAULT_VELOCITY,
      channel: PROJECT_MIDI_NOTE_DEFAULT_CHANNEL,
    })

    fixture.session.undo()
    expect(noteRecords(fixture.session)).toEqual([])
    fixture.session.redo()
    expect(noteRecords(fixture.session)).toEqual([note])
  })

  it('places Track Notes through one atomic add, extension or new-Clip command', () => {
    const fixture = createMidiClipFixture('track-placement')
    const trackId = fixture.session.getSnapshot().tracks[0]?.id
    if (trackId === undefined) throw new Error('Expected an Instrument Track')
    const addCoordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: () => 'note-midi-note-track-placement-add',
    })
    const addRevision = fixture.session.modelRevision
    const added = addCoordinator.placeMidiNoteOnTrack({
      activeClipId: fixture.clipId,
      barSpanTick: parsePositiveTick(3_840),
      baseRevision: addRevision,
      noteDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
      projectStartTick: parseTick(120),
      trackId,
    })

    expect(added).toMatchObject({
      action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.ADD_TO_CLIP,
      clipId: fixture.clipId,
      noteId: 'note-midi-note-track-placement-add',
    })
    expect(added.commit.origin).toEqual({
      kind: 'command',
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
    })
    expect(fixture.session.modelRevision).toBe(addRevision + 1)

    const extendCoordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: () => 'note-midi-note-track-placement-extend',
    })
    const extendRevision = fixture.session.modelRevision
    const extended = extendCoordinator.placeMidiNoteOnTrack({
      activeClipId: fixture.clipId,
      barSpanTick: parsePositiveTick(3_840),
      baseRevision: extendRevision,
      noteDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(64),
      projectStartTick: parseTick(900),
      trackId,
    })

    expect(extended.action).toBe(PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP)
    expect(extended.commit.origin).toEqual({
      kind: 'command',
      commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE,
    })
    expect(
      fixture.session.getSnapshot().clips.find(({ id }) => id === fixture.clipId),
    ).toMatchObject({ spanTick: 1_140 })
    expect(noteRecords(fixture.session)).toContainEqual(
      expect.objectContaining({
        id: 'note-midi-note-track-placement-extend',
        durationTick: 240,
        startTick: 1_380,
      }),
    )
    expect(fixture.session.modelRevision).toBe(extendRevision + 1)

    const createCoordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: createIdentitySource(
        'note-midi-note-track-placement-create',
        'clip-midi-note-track-placement-create',
        'source-midi-note-track-placement-create',
      ),
    })
    const createRevision = fixture.session.modelRevision
    const created = createCoordinator.placeMidiNoteOnTrack({
      activeClipId: fixture.clipId,
      barSpanTick: parsePositiveTick(3_840),
      baseRevision: createRevision,
      noteDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(67),
      projectStartTick: parseTick(6_000),
      trackId,
    })

    expect(created).toMatchObject({
      action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.CREATE_CLIP,
      clipId: 'clip-midi-note-track-placement-create',
      noteId: 'note-midi-note-track-placement-create',
    })
    expect(created.commit.origin).toEqual({
      kind: 'command',
      commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE,
    })
    expect(
      fixture.session.getSnapshot().clips.find(({ id }) => id === created.clipId),
    ).toMatchObject({
      sourceId: 'source-midi-note-track-placement-create',
      spanTick: 3_840,
      startTick: 3_840,
    })
    expect(noteRecords(fixture.session)).toContainEqual(
      expect.objectContaining({
        id: 'note-midi-note-track-placement-create',
        startTick: 2_160,
      }),
    )
    expect(fixture.session.modelRevision).toBe(createRevision + 1)
  })

  it('shortens the desired duration to the positive time remaining in the Clip', () => {
    const fixture = createMidiClipFixture('shortened')
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: () => 'note-midi-note-shortened',
    })

    coordinator.addMidiNote({
      clipId: fixture.clipId,
      clipStartTick: parseTick(900),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(72),
    })

    expect(noteRecords(fixture.session)[0]).toMatchObject({
      startTick: 1_380,
      durationTick: 60,
    })
  })

  it('moves selected Notes in one Commit with a shared Tick and Pitch delta', () => {
    const fixture = createMidiClipFixture('move-many')
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: createIdentitySource(
        'note-midi-note-move-many-1',
        'note-midi-note-move-many-2',
      ),
    })
    const noteIds = [
      coordinator.addMidiNote({
        clipId: fixture.clipId,
        clipStartTick: parseTick(120),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
      }).noteId,
      coordinator.addMidiNote({
        clipId: fixture.clipId,
        clipStartTick: parseTick(480),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(64),
      }).noteId,
    ]
    const revisionBeforeMove = fixture.session.modelRevision
    const result = coordinator.moveMidiNotes({
      baseRevision: revisionBeforeMove,
      clipId: fixture.clipId,
      deltaPitch: parseMidiPitchDelta(2),
      deltaTick: parseTickDelta(120),
      noteIds,
    })

    expect(result).not.toBeNull()
    expect(result?.commit.baseRevision).toBe(revisionBeforeMove)
    expect(result?.commit.modelRevision).toBe(revisionBeforeMove + 1)
    expect(result?.commit.origin).toEqual({
      kind: 'command',
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE,
    })
    expect(result?.commit.delta.changes).toEqual([
      expect.objectContaining({
        type: PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED,
        noteId: noteIds[0],
      }),
      expect.objectContaining({
        type: PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED,
        noteId: noteIds[1],
      }),
    ])
    expect(noteRecords(fixture.session)).toEqual([
      expect.objectContaining({ id: noteIds[0], pitch: 62, startTick: 720 }),
      expect.objectContaining({ id: noteIds[1], pitch: 66, startTick: 1_080 }),
    ])

    fixture.session.undo()
    expect(noteRecords(fixture.session)).toEqual([
      expect.objectContaining({ id: noteIds[0], pitch: 60, startTick: 600 }),
      expect.objectContaining({ id: noteIds[1], pitch: 64, startTick: 960 }),
    ])
  })

  it('rejects a Move gesture captured against a stale Project revision', () => {
    const fixture = createMidiClipFixture('move-stale')
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: createIdentitySource(
        'note-midi-note-move-stale-1',
        'note-midi-note-move-stale-2',
      ),
    })
    const noteId = coordinator.addMidiNote({
      clipId: fixture.clipId,
      clipStartTick: parseTick(120),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
    }).noteId
    const gestureRevision = fixture.session.modelRevision

    coordinator.addMidiNote({
      clipId: fixture.clipId,
      clipStartTick: parseTick(480),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(64),
    })
    const revisionBeforeRejectedMove = fixture.session.modelRevision

    expect(() =>
      coordinator.moveMidiNotes({
        baseRevision: gestureRevision,
        clipId: fixture.clipId,
        deltaPitch: parseMidiPitchDelta(1),
        deltaTick: parseTickDelta(120),
        noteIds: [noteId],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'base-revision-mismatch',
        baseRevision: gestureRevision,
        currentRevision: revisionBeforeRejectedMove,
      }),
    )
    expect(fixture.session.modelRevision).toBe(revisionBeforeRejectedMove)
    expect(noteRecords(fixture.session)[0]).toMatchObject({
      id: noteId,
      pitch: 60,
      startTick: 600,
    })
  })

  it('returns no change for zero movement and rejects an invalid Selection atomically', () => {
    const fixture = createMidiClipFixture('move-rejected')
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: createIdentitySource(
        'note-midi-note-move-rejected-1',
        'note-midi-note-move-rejected-2',
      ),
    })
    const noteIds = [
      coordinator.addMidiNote({
        clipId: fixture.clipId,
        clipStartTick: parseTick(120),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
      }).noteId,
      coordinator.addMidiNote({
        clipId: fixture.clipId,
        clipStartTick: parseTick(480),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(64),
      }).noteId,
    ]
    const revisionBeforeMove = fixture.session.modelRevision

    expect(
      coordinator.moveMidiNotes({
        baseRevision: revisionBeforeMove,
        clipId: fixture.clipId,
        deltaPitch: parseMidiPitchDelta(0),
        deltaTick: parseTickDelta(0),
        noteIds,
      }),
    ).toBeNull()
    expect(fixture.session.modelRevision).toBe(revisionBeforeMove)

    expect(() =>
      coordinator.moveMidiNotes({
        baseRevision: revisionBeforeMove,
        clipId: fixture.clipId,
        deltaPitch: parseMidiPitchDelta(0),
        deltaTick: parseTickDelta(300),
        noteIds,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'note-out-of-source-range',
        noteId: noteIds[1],
      }),
    )
    expect(fixture.session.modelRevision).toBe(revisionBeforeMove)
    expect(noteRecords(fixture.session)).toEqual([
      expect.objectContaining({ id: noteIds[0], startTick: 600 }),
      expect.objectContaining({ id: noteIds[1], startTick: 960 }),
    ])
  })

  it('resizes one Note with final MidiSource geometry and one History step', () => {
    const fixture = createMidiClipFixture('resize')
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: () => 'note-midi-note-resize',
    })
    const noteId = coordinator.addMidiNote({
      clipId: fixture.clipId,
      clipStartTick: parseTick(120),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
    }).noteId
    const revisionBeforeResize = fixture.session.modelRevision

    const result = coordinator.resizeMidiNote({
      baseRevision: revisionBeforeResize,
      clipId: fixture.clipId,
      durationTick: parsePositiveTick(360),
      noteId,
      sourceStartTick: parseTick(480),
    })

    expect(Object.isFrozen(result)).toBe(true)
    expect(result).toMatchObject({
      durationTick: 360,
      noteId,
      sourceStartTick: 480,
    })
    expect(result?.commit.baseRevision).toBe(revisionBeforeResize)
    expect(result?.commit.modelRevision).toBe(revisionBeforeResize + 1)
    expect(result?.commit.origin).toEqual({
      kind: 'command',
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE,
    })
    expect(result?.commit.delta.changes).toEqual([
      expect.objectContaining({
        noteId,
        type: PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED,
      }),
    ])
    expect(noteRecords(fixture.session)[0]).toMatchObject({
      durationTick: 360,
      id: noteId,
      pitch: 60,
      startTick: 480,
    })

    fixture.session.undo()
    expect(noteRecords(fixture.session)[0]).toMatchObject({
      durationTick: 240,
      id: noteId,
      startTick: 600,
    })
    fixture.session.redo()
    expect(noteRecords(fixture.session)[0]).toMatchObject({
      durationTick: 360,
      id: noteId,
      startTick: 480,
    })
  })

  it('returns no change for identical Resize geometry and rejects a stale gesture', () => {
    const fixture = createMidiClipFixture('resize-stale')
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: createIdentitySource(
        'note-midi-note-resize-stale-1',
        'note-midi-note-resize-stale-2',
      ),
    })
    const noteId = coordinator.addMidiNote({
      clipId: fixture.clipId,
      clipStartTick: parseTick(120),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
    }).noteId
    const gestureRevision = fixture.session.modelRevision

    expect(
      coordinator.resizeMidiNote({
        baseRevision: gestureRevision,
        clipId: fixture.clipId,
        durationTick: parsePositiveTick(240),
        noteId,
        sourceStartTick: parseTick(600),
      }),
    ).toBeNull()
    expect(fixture.session.modelRevision).toBe(gestureRevision)

    coordinator.addMidiNote({
      clipId: fixture.clipId,
      clipStartTick: parseTick(480),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(64),
    })
    const revisionBeforeRejectedResize = fixture.session.modelRevision

    expect(() =>
      coordinator.resizeMidiNote({
        baseRevision: gestureRevision,
        clipId: fixture.clipId,
        durationTick: parsePositiveTick(480),
        noteId,
        sourceStartTick: parseTick(600),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        baseRevision: gestureRevision,
        code: 'base-revision-mismatch',
        currentRevision: revisionBeforeRejectedResize,
      }),
    )
    expect(fixture.session.modelRevision).toBe(revisionBeforeRejectedResize)
    expect(noteRecords(fixture.session)[0]).toMatchObject({
      durationTick: 240,
      id: noteId,
      startTick: 600,
    })
  })

  it('removes selected Notes in one Commit and one reversible History step', () => {
    const fixture = createMidiClipFixture('remove-many')
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: createIdentitySource(
        'note-midi-note-remove-many-1',
        'note-midi-note-remove-many-2',
      ),
    })
    const noteIds = [
      coordinator.addMidiNote({
        clipId: fixture.clipId,
        clipStartTick: parseTick(120),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
      }).noteId,
      coordinator.addMidiNote({
        clipId: fixture.clipId,
        clipStartTick: parseTick(480),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(64),
      }).noteId,
    ]
    const revisionBeforeRemove = fixture.session.modelRevision
    const result = coordinator.removeMidiNotes({
      clipId: fixture.clipId,
      noteIds,
    })

    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.noteIds)).toBe(true)
    expect(result.noteIds).toEqual(noteIds)
    expect(result.commit.baseRevision).toBe(revisionBeforeRemove)
    expect(result.commit.modelRevision).toBe(revisionBeforeRemove + 1)
    expect(result.commit.origin).toEqual({
      kind: 'command',
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE,
    })
    expect(result.commit.delta.changes).toEqual([
      expect.objectContaining({
        type: PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED,
        noteId: noteIds[0],
      }),
      expect.objectContaining({
        type: PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED,
        noteId: noteIds[1],
      }),
    ])
    expect(noteRecords(fixture.session)).toEqual([])

    fixture.session.undo()
    expect(
      noteRecords(fixture.session)
        .map(({ id }) => id)
        .sort(),
    ).toEqual([...noteIds].sort())
    fixture.session.redo()
    expect(noteRecords(fixture.session)).toEqual([])
  })

  it('does not partially remove a selection containing a missing Note', () => {
    const fixture = createMidiClipFixture('remove-many-rejected')
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: () => 'note-midi-note-remove-many-existing',
    })
    const existingNoteId = coordinator.addMidiNote({
      clipId: fixture.clipId,
      clipStartTick: parseTick(120),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
    }).noteId
    const revisionBeforeRemove = fixture.session.modelRevision
    const missingNoteId = parseNoteId('note-midi-note-remove-many-missing')

    expect(() =>
      coordinator.removeMidiNotes({
        clipId: fixture.clipId,
        noteIds: [existingNoteId, missingNoteId],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'midi-note-not-found',
        noteId: missingNoteId,
      }),
    )
    expect(fixture.session.modelRevision).toBe(revisionBeforeRemove)
    expect(noteRecords(fixture.session).map(({ id }) => id)).toEqual([existingNoteId])
  })

  it('uses the live Session revision for consecutive overlapping Notes', () => {
    const fixture = createMidiClipFixture('revision')
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: createIdentitySource(
        'note-midi-note-revision-1',
        'note-midi-note-revision-2',
      ),
    })
    const input = {
      clipId: fixture.clipId,
      clipStartTick: parseTick(240),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(64),
    }

    coordinator.addMidiNote(input)
    coordinator.addMidiNote(input)

    expect(fixture.readyState.modelRevision).toBe(0)
    expect(noteRecords(fixture.session).map(({ id }) => id)).toEqual([
      'note-midi-note-revision-1',
      'note-midi-note-revision-2',
    ])
  })

  it('rejects a Clip endpoint before consuming a Note identity', () => {
    const fixture = createMidiClipFixture('endpoint')
    let identityCalls = 0
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: () => {
        identityCalls += 1
        return `unused-midi-note-${identityCalls}`
      },
    })

    expect(() =>
      coordinator.addMidiNote({
        clipId: fixture.clipId,
        clipStartTick: parseTick(960),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectMidiNoteError>>({
        name: 'ProjectMidiNoteError',
        code: 'note-start-outside-clip',
        clipId: fixture.clipId,
        clipSpanTick: parseTick(960),
        clipStartTick: parseTick(960),
      }),
    )
    expect(identityCalls).toBe(0)
    expect(noteRecords(fixture.session)).toEqual([])
  })

  it('rejects unavailable Active Project and Clip targets', () => {
    const idleActiveProject: Pick<ActiveProjectService, 'state'> = {
      state: Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }),
    }
    const idleCoordinator = createProjectMidiNoteCoordinator({
      activeProject: idleActiveProject,
      createUniqueId: () => 'unused-midi-note-idle',
    })
    const input = {
      clipId: parseClipId('missing-midi-note-clip'),
      clipStartTick: parseTick(0),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
    }

    expect(() => idleCoordinator.addMidiNote(input)).toThrowError(
      expect.objectContaining<Partial<ProjectMidiNoteError>>({
        code: 'active-project-not-ready',
        phase: ACTIVE_PROJECT_PHASE.IDLE,
      }),
    )

    const session = createSession('missing-clip')
    const readyCoordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: createReadyState(session) },
      createUniqueId: () => 'unused-midi-note-missing-clip',
    })
    expect(() => readyCoordinator.addMidiNote(input)).toThrowError(
      expect.objectContaining<Partial<ProjectMidiNoteError>>({
        code: 'target-clip-not-found',
        clipId: input.clipId,
      }),
    )
  })

  it('fails closed when the Clip source graph is unavailable', () => {
    const missingSourceFixture = createMidiClipFixture('missing-source')
    const missingSourceSnapshot = missingSourceFixture.session.getSnapshot()
    vi.spyOn(missingSourceFixture.session, 'getSnapshot').mockReturnValue(
      Object.freeze({
        ...missingSourceSnapshot,
        midiSources: Object.freeze([]),
      }),
    )
    const missingSourceCoordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: missingSourceFixture.readyState },
      createUniqueId: () => 'unused-midi-note-missing-source',
    })
    const input = {
      clipId: missingSourceFixture.clipId,
      clipStartTick: parseTick(0),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
    }

    expect(() => missingSourceCoordinator.addMidiNote(input)).toThrowError(
      expect.objectContaining<Partial<ProjectMidiNoteError>>({
        code: 'target-midi-source-not-found',
        clipId: missingSourceFixture.clipId,
      }),
    )

    const missingPartitionFixture = createMidiClipFixture('missing-partition')
    const missingPartitionSnapshot = missingPartitionFixture.session.getSnapshot()
    vi.spyOn(missingPartitionFixture.session, 'getSnapshot').mockReturnValue(
      Object.freeze({
        ...missingPartitionSnapshot,
        midiNotePartitions: Object.freeze([]),
      }),
    )
    const missingPartitionCoordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: missingPartitionFixture.readyState },
      createUniqueId: () => 'unused-midi-note-missing-partition',
    })

    expect(() =>
      missingPartitionCoordinator.addMidiNote({
        ...input,
        clipId: missingPartitionFixture.clipId,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectMidiNoteError>>({
        code: 'target-midi-note-partition-not-found',
        clipId: missingPartitionFixture.clipId,
      }),
    )
  })

  it('rejects looped Clips before consuming a Note identity', () => {
    const fixture = createMidiClipFixture('looped', { looped: true })
    let identityCalls = 0
    const coordinator = createProjectMidiNoteCoordinator({
      activeProject: { state: fixture.readyState },
      createUniqueId: () => {
        identityCalls += 1
        return `unused-midi-note-looped-${identityCalls}`
      },
    })

    expect(() =>
      coordinator.addMidiNote({
        clipId: fixture.clipId,
        clipStartTick: parseTick(0),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectMidiNoteError>>({
        code: 'target-clip-looped',
        clipId: fixture.clipId,
      }),
    )
    expect(identityCalls).toBe(0)
  })
})
