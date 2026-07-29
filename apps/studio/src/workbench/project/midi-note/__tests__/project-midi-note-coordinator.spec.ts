import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  ProjectCommandError,
  createAddMidiClipCommand,
  createInitialProjectSession,
  parseClipId,
  parseMidiPitch,
  parseMidiSourceId,
  parseNoteId,
  parsePositiveTick,
  parseProjectId,
  parseTempoEventId,
  parseTick,
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
    createUniqueId: createIdentitySource(
      `track-midi-note-${suffix}`,
      `device-midi-note-${suffix}`,
    ),
    createRandomValue: () => 0,
  }).addInstrumentTrack()
  const clipId = parseClipId(`clip-midi-note-${suffix}`)
  const sourceId = parseMidiSourceId(`source-midi-note-${suffix}`)
  const spanTick = parsePositiveTick(options.spanTick ?? 960)
  const sourceOffsetTick = parseTick(options.sourceOffsetTick ?? 480)
  const sourceLengthTick = parsePositiveTick(
    options.looped ? 960 : sourceOffsetTick + spanTick,
  )
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
    expect(result.commit.delta.changes[0]?.type).toBe(
      PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED,
    )
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
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE_MANY,
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
    expect(noteRecords(fixture.session).map(({ id }) => id).sort()).toEqual(
      [...noteIds].sort(),
    )
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
    expect(noteRecords(fixture.session).map(({ id }) => id)).toEqual([
      existingNoteId,
    ])
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
    const missingPartitionSnapshot =
      missingPartitionFixture.session.getSnapshot()
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
