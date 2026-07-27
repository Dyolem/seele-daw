import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_TYPE,
  ProjectCommandError,
  createInitialProjectSession,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  parseTrackId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  createProjectClipCoordinator,
  type ProjectClipCoordinatorDependencies,
} from '@/workbench/project/clip/project-clip-coordinator'
import { ProjectClipError } from '@/workbench/project/clip/project-clip-error'
import { createProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'

function createSession(suffix: string): ProjectSession {
  return createInitialProjectSession({
    projectId: parseProjectId(`project-clip-${suffix}`),
    projectName: `Clip ${suffix}`,
    tempoEventId: parseTempoEventId(`tempo-clip-${suffix}`),
    timeSignatureEventId: parseTimeSignatureEventId(`meter-clip-${suffix}`),
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

function createInstrumentTrack(
  readyState: ReadyActiveProjectState,
): ReturnType<ReturnType<typeof createProjectTrackCoordinator>['addInstrumentTrack']> {
  return createProjectTrackCoordinator({
    activeProject: { state: readyState },
    createUniqueId: createIdentitySource('track-clip-target', 'device-clip-target'),
    createRandomValue: () => 0,
  }).addInstrumentTrack()
}

function createDependencies(
  readyState: ReadyActiveProjectState,
  identities: readonly string[],
): ProjectClipCoordinatorDependencies {
  return {
    activeProject: { state: readyState },
    createUniqueId: createIdentitySource(...identities),
  }
}

describe('ProjectClipCoordinator', () => {
  it('creates one snapped, one-bar empty MIDI Clip with product defaults', () => {
    const session = createSession('defaults')
    const readyState = createReadyState(session)
    const track = createInstrumentTrack(readyState)
    const coordinator = createProjectClipCoordinator(
      createDependencies(readyState, ['clip-defaults', 'source-defaults']),
    )
    const result = coordinator.addEmptyMidiClip({
      trackId: track.trackId,
      targetTick: parseTick(5_000),
    })
    const snapshot = session.getSnapshot()
    const clip = snapshot.clips[0]
    const source = snapshot.midiSources[0]
    const partition = snapshot.midiNotePartitions[0]

    expect(Object.isFrozen(coordinator)).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(result).toMatchObject({
      clipId: 'clip-defaults',
      trackId: track.trackId,
      commit: {
        origin: {
          kind: 'command',
          commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD,
        },
      },
    })
    expect(result.commit.delta.changes[0]?.type).toBe(PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED)
    expect(clip).toEqual({
      id: 'clip-defaults',
      kind: 'midi',
      trackId: track.trackId,
      name: 'Instrument 1',
      color: null,
      muted: false,
      startTick: 3_840,
      spanTick: 3_840,
      sourceId: 'source-defaults',
      sourceOffsetTick: 0,
      loop: null,
    })
    expect(source).toEqual({
      id: 'source-defaults',
      lengthTick: 3_840,
    })
    expect(partition).toEqual({
      sourceId: 'source-defaults',
      notes: [],
    })
    expect(session.canUndo).toBe(true)
  })

  it('uses the live Session revision and preserves model-level overlap support', () => {
    const session = createSession('overlap')
    const readyState = createReadyState(session)
    const track = createInstrumentTrack(readyState)
    const coordinator = createProjectClipCoordinator(
      createDependencies(readyState, [
        'clip-overlap-first',
        'source-overlap-first',
        'clip-overlap-second',
        'source-overlap-second',
      ]),
    )

    coordinator.addEmptyMidiClip({ trackId: track.trackId, targetTick: parseTick(1_000) })
    coordinator.addEmptyMidiClip({ trackId: track.trackId, targetTick: parseTick(2_000) })

    expect(readyState.modelRevision).toBe(0)
    expect(session.modelRevision).toBe(3)
    expect(
      session.getSnapshot().clips.map(({ startTick }) => startTick),
    ).toEqual([0, 0])
  })

  it('rejects unavailable target state before consuming Clip identities', () => {
    const session = createSession('missing-track')
    const readyState = createReadyState(session)
    const missingTrackId = parseTrackId('track-clip-missing')
    let identityCalls = 0
    const coordinator = createProjectClipCoordinator({
      activeProject: { state: readyState },
      createUniqueId: () => {
        identityCalls += 1
        return `unused-clip-identity-${identityCalls}`
      },
    })

    expect(() =>
      coordinator.addEmptyMidiClip({
        trackId: missingTrackId,
        targetTick: parseTick(0),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectClipError>>({
        name: 'ProjectClipError',
        code: 'target-track-not-found',
        trackId: missingTrackId,
      }),
    )
    expect(identityCalls).toBe(0)
    expect(session.modelRevision).toBe(0)
  })

  it('rejects creation without a Ready Active Project', () => {
    const activeProject: Pick<ActiveProjectService, 'state'> = {
      state: Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }),
    }
    const coordinator = createProjectClipCoordinator({
      activeProject,
      createUniqueId: () => 'unused-clip-identity',
    })

    expect(() =>
      coordinator.addEmptyMidiClip({
        trackId: parseTrackId('track-clip-idle'),
        targetTick: parseTick(0),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectClipError>>({
        code: 'active-project-not-ready',
        phase: ACTIVE_PROJECT_PHASE.IDLE,
      }),
    )
  })

  it('preserves Project Core identity failures instead of wrapping them', () => {
    const session = createSession('duplicate')
    const readyState = createReadyState(session)
    const track = createInstrumentTrack(readyState)
    const input = { trackId: track.trackId, targetTick: parseTick(0) }

    createProjectClipCoordinator(
      createDependencies(readyState, ['clip-duplicate', 'source-duplicate']),
    ).addEmptyMidiClip(input)

    const duplicateCoordinator = createProjectClipCoordinator(
      createDependencies(readyState, ['clip-duplicate', 'source-duplicate-other']),
    )

    expect(() => duplicateCoordinator.addEmptyMidiClip(input)).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        name: 'ProjectCommandError',
        code: 'clip-id-already-exists',
      }),
    )
  })
})
