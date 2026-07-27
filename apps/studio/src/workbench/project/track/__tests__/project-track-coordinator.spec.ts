import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_TYPE,
  createInitialProjectSession,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
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
  INSTRUMENT_SLOT_DEVICE_TYPE_ID,
  createProjectTrackCoordinator,
  type ProjectTrackCoordinatorDependencies,
} from '@/workbench/project/track/project-track-coordinator'
import { ProjectTrackError } from '@/workbench/project/track/project-track-error'
import { PROJECT_TRACK_PALETTE } from '@/workbench/project/track/project-track-palette'

function createSession(suffix: string): ProjectSession {
  return createInitialProjectSession({
    projectId: parseProjectId(`project-track-${suffix}`),
    projectName: `Track ${suffix}`,
    tempoEventId: parseTempoEventId(`tempo-track-${suffix}`),
    timeSignatureEventId: parseTimeSignatureEventId(`meter-track-${suffix}`),
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

function createDependencies(
  session: ProjectSession,
  identities: readonly string[],
  randomValue = 0,
): ProjectTrackCoordinatorDependencies {
  const activeProject: Pick<ActiveProjectService, 'state'> = {
    state: createReadyState(session),
  }

  return {
    activeProject,
    createUniqueId: createIdentitySource(...identities),
    createRandomValue: () => randomValue,
  }
}

describe('ProjectTrackCoordinator', () => {
  it('adds one append-only Instrument Slot Track with product defaults', () => {
    const session = createSession('defaults')
    const coordinator = createProjectTrackCoordinator(
      createDependencies(session, ['track-defaults', 'device-defaults'], 0),
    )
    const result = coordinator.addInstrumentTrack()
    const snapshot = session.getSnapshot()
    const track = snapshot.tracks[0]
    const device = snapshot.devices[0]

    expect(Object.isFrozen(coordinator)).toBe(true)
    expect(Object.isFrozen(result)).toBe(true)
    expect(result.trackId).toBe('track-defaults')
    expect(result.commit.origin).toEqual({
      kind: 'command',
      commandType: PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD,
    })
    expect(result.commit.delta.changes).toHaveLength(1)
    expect(result.commit.delta.changes[0]?.type).toBe(
      PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED,
    )
    expect(snapshot.trackOrder).toEqual(['track-defaults'])
    expect(track).toMatchObject({
      id: 'track-defaults',
      kind: 'instrument',
      name: 'Instrument 1',
      color: PROJECT_TRACK_PALETTE[0],
      channel: {
        gain: 1,
        pan: 0,
        muted: false,
        soloed: false,
      },
      midiEffectIds: [],
      audioEffectIds: [],
      instrumentDeviceId: 'device-defaults',
    })
    expect(device).toEqual({
      id: 'device-defaults',
      typeId: INSTRUMENT_SLOT_DEVICE_TYPE_ID,
      definitionVersion: 1,
      enabled: true,
      parameters: {},
      opaqueState: null,
    })
    expect(session.canUndo).toBe(true)
  })

  it('numbers sequential Instrument Tracks and avoids the adjacent color', () => {
    const session = createSession('sequence')
    const coordinator = createProjectTrackCoordinator(
      createDependencies(
        session,
        ['track-sequence-1', 'device-sequence-1', 'track-sequence-2', 'device-sequence-2'],
        0,
      ),
    )

    coordinator.addInstrumentTrack()
    coordinator.addInstrumentTrack()

    const snapshot = session.getSnapshot()
    const tracksById = new Map(snapshot.tracks.map((track) => [track.id, track] as const))
    const orderedTracks = snapshot.trackOrder.map((trackId) => tracksById.get(trackId)!)

    expect(orderedTracks.map(({ name }) => name)).toEqual(['Instrument 1', 'Instrument 2'])
    expect(orderedTracks.map(({ color }) => color)).toEqual([
      PROJECT_TRACK_PALETTE[0],
      PROJECT_TRACK_PALETTE[1],
    ])
    expect(orderedTracks[0]?.color).not.toBe(orderedTracks[1]?.color)

    session.undo()
    expect(session.getSnapshot().trackOrder).toEqual(['track-sequence-1'])
  })

  it('uses the current Session revision even before Active Project publishes its next state', () => {
    const session = createSession('revision')
    const staleReadyState = createReadyState(session)
    const activeProject: Pick<ActiveProjectService, 'state'> = { state: staleReadyState }
    const coordinator = createProjectTrackCoordinator({
      activeProject,
      createUniqueId: createIdentitySource(
        'track-revision-1',
        'device-revision-1',
        'track-revision-2',
        'device-revision-2',
      ),
      createRandomValue: () => 0.5,
    })

    coordinator.addInstrumentTrack()
    expect(staleReadyState.modelRevision).toBe(0)
    expect(session.modelRevision).toBe(1)
    expect(() => coordinator.addInstrumentTrack()).not.toThrow()
    expect(session.modelRevision).toBe(2)
  })

  it('rejects Track creation when there is no Ready Active Project', () => {
    const activeProject: Pick<ActiveProjectService, 'state'> = {
      state: Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }),
    }
    const coordinator = createProjectTrackCoordinator({
      activeProject,
      createUniqueId: () => 'unused-id',
      createRandomValue: () => 0,
    })

    expect(() => coordinator.addInstrumentTrack()).toThrowError(
      expect.objectContaining<Partial<ProjectTrackError>>({
        name: 'ProjectTrackError',
        code: 'active-project-not-ready',
        phase: ACTIVE_PROJECT_PHASE.IDLE,
      }),
    )
  })

  it('rejects invalid randomness before consuming entity identities or mutating the Session', () => {
    const session = createSession('invalid-random')
    let identityCalls = 0
    const coordinator = createProjectTrackCoordinator({
      activeProject: { state: createReadyState(session) },
      createUniqueId: () => {
        identityCalls += 1
        return `unused-${identityCalls}`
      },
      createRandomValue: () => 1,
    })

    expect(() => coordinator.addInstrumentTrack()).toThrowError(
      expect.objectContaining<Partial<ProjectTrackError>>({
        code: 'invalid-random-value',
        randomValue: 1,
      }),
    )
    expect(identityCalls).toBe(0)
    expect(session.modelRevision).toBe(0)
    expect(session.getSnapshot().tracks).toEqual([])
  })
})
