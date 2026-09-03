import {
  PROJECT_CHANGE_TYPE,
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  createAddInstrumentTrackCommand,
  createInitialProjectSession,
  createProjectFileDTO,
  createProjectSessionFromProjectFile,
  parseBipolarValue,
  parseDeviceId,
  parseLinearGain,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  parseTrackId,
  type ProjectSession,
} from '@seele-daw/project-core'
import {
  STUDIO_GRAND_DEVICE_DEFINITION,
  createSampleInstrumentDeviceDescriptor,
  decodeSampleInstrumentDeviceState,
  decodeStudioGrandDeviceState,
  parseSoundbankId,
} from '@seele-daw/playback'
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

function addLegacyInstrumentSlotTrack(session: ProjectSession, suffix: string) {
  const trackId = parseTrackId(`track-legacy-slot-${suffix}`)
  const deviceId = parseDeviceId(`device-legacy-slot-${suffix}`)
  const result = session.execute(
    createAddInstrumentTrackCommand({
      baseRevision: session.modelRevision,
      trackId,
      name: 'Legacy Instrument',
      color: null,
      channel: {
        gain: parseLinearGain(1),
        pan: parseBipolarValue(0),
        muted: false,
        soloed: false,
      },
      instrumentDevice: {
        id: deviceId,
        typeId: INSTRUMENT_SLOT_DEVICE_TYPE_ID,
        definitionVersion: 1,
        enabled: true,
        parameters: {},
        opaqueState: null,
      },
      insertAt: session.getSnapshot().trackOrder.length,
    }),
  )

  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Expected the legacy Instrument Slot fixture to commit')
  }

  return { deviceId, trackId } as const
}

describe('ProjectTrackCoordinator', () => {
  it('adds one append-only Studio Grand Instrument Track with product defaults', () => {
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
    expect(result.commit.delta.changes[0]?.type).toBe(PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED)
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
      typeId: STUDIO_GRAND_DEVICE_DEFINITION.typeId,
      definitionVersion: STUDIO_GRAND_DEVICE_DEFINITION.definitionVersion,
      enabled: true,
      parameters: {},
      opaqueState: { soundbankId: 'studio-grand' },
    })
    expect(decodeStudioGrandDeviceState(device!)).toEqual({ soundbankId: 'studio-grand' })
    expect(session.canUndo).toBe(true)
  })

  it('explicitly replaces a legacy empty Slot and preserves it through save, Undo, and Redo', () => {
    const session = createSession('legacy-slot')
    const { deviceId, trackId } = addLegacyInstrumentSlotTrack(session, 'selection')
    const coordinator = createProjectTrackCoordinator(createDependencies(session, [], 0))
    const result = coordinator.selectBuiltInInstrument(trackId, parseSoundbankId('solo-violin'))

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected Violin selection to commit')
    }

    expect(result.commit.delta.changes).toEqual([
      expect.objectContaining({
        type: PROJECT_CHANGE_TYPE.INSTRUMENT_DEVICE.UPDATED,
        trackId,
        deviceId,
      }),
    ])
    expect(decodeSampleInstrumentDeviceState(session.getSnapshot().devices[0]!)).toEqual({
      soundbankId: 'solo-violin',
    })

    const projectFile = createProjectFileDTO(session.getSnapshot())
    const reloaded = createProjectSessionFromProjectFile(projectFile)
    expect(
      decodeSampleInstrumentDeviceState(
        reloaded.getSnapshot().devices.find((device) => device.id === deviceId)!,
      ),
    ).toEqual({ soundbankId: 'solo-violin' })

    session.undo()
    expect(session.getSnapshot().devices.find((device) => device.id === deviceId)).toEqual(
      expect.objectContaining({
        id: deviceId,
        typeId: INSTRUMENT_SLOT_DEVICE_TYPE_ID,
        opaqueState: null,
      }),
    )

    session.redo()
    expect(
      decodeSampleInstrumentDeviceState(
        session.getSnapshot().devices.find((device) => device.id === deviceId)!,
      ),
    ).toEqual({ soundbankId: 'solo-violin' })
  })

  it('explicitly replaces an unknown Sample Soundbank without changing the Device identity', () => {
    const session = createSession('missing-sample')
    const trackId = parseTrackId('track-missing-sample')
    const deviceId = parseDeviceId('device-missing-sample')
    const addResult = session.execute(
      createAddInstrumentTrackCommand({
        baseRevision: session.modelRevision,
        trackId,
        name: 'Unknown Sample',
        color: null,
        channel: {
          gain: parseLinearGain(1),
          pan: parseBipolarValue(0),
          muted: false,
          soloed: false,
        },
        instrumentDevice: createSampleInstrumentDeviceDescriptor(
          deviceId,
          parseSoundbankId('unknown-orchestral-bank'),
        ),
        insertAt: 0,
      }),
    )
    if (addResult.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('Expected missing Sample fixture to commit')
    }
    const coordinator = createProjectTrackCoordinator(createDependencies(session, []))

    const result = coordinator.selectBuiltInInstrument(trackId, parseSoundbankId('flute'))

    expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    expect(session.getSnapshot().tracks[0]).toMatchObject({
      id: trackId,
      instrumentDeviceId: deviceId,
      kind: 'instrument',
    })
    expect(session.getSnapshot().devices[0]?.id).toBe(deviceId)
    expect(decodeSampleInstrumentDeviceState(session.getSnapshot().devices[0]!)).toEqual({
      soundbankId: 'flute',
    })

    session.undo()
    expect(decodeSampleInstrumentDeviceState(session.getSnapshot().devices[0]!)).toEqual({
      soundbankId: 'unknown-orchestral-bank',
    })
  })

  it('returns no-change when Studio Grand is already selected', () => {
    const session = createSession('studio-grand-no-change')
    const coordinator = createProjectTrackCoordinator(
      createDependencies(
        session,
        ['track-studio-grand-no-change', 'device-studio-grand-no-change'],
        0,
      ),
    )
    const track = coordinator.addInstrumentTrack()
    const contentStateId = session.contentStateId
    const result = coordinator.selectBuiltInInstrument(
      track.trackId,
      parseSoundbankId('studio-grand'),
    )

    expect(result).toEqual({
      status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
      reason: 'already-at-target',
      modelRevision: 1,
    })
    expect(session.modelRevision).toBe(1)
    expect(session.contentStateId).toBe(contentStateId)
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
    expect(() =>
      coordinator.selectBuiltInInstrument(
        parseTrackId('track-not-ready'),
        parseSoundbankId('studio-grand'),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectTrackError>>({
        code: 'active-project-not-ready',
        phase: ACTIVE_PROJECT_PHASE.IDLE,
      }),
    )
  })

  it('rejects a built-in Instrument selection for a missing Track without changing the Session', () => {
    const session = createSession('missing-selection-track')
    const coordinator = createProjectTrackCoordinator(createDependencies(session, [], 0))
    const trackId = parseTrackId('track-missing-selection')

    expect(() =>
      coordinator.selectBuiltInInstrument(trackId, parseSoundbankId('studio-grand')),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectTrackError>>({
        code: 'track-not-found',
        trackId,
      }),
    )
    expect(session.modelRevision).toBe(0)
    expect(session.getSnapshot().tracks).toEqual([])
  })

  it('rejects an unknown Soundbank before changing the selected Track Device', () => {
    const session = createSession('unknown-selection')
    const coordinator = createProjectTrackCoordinator(
      createDependencies(session, ['track-unknown-selection', 'device-unknown-selection']),
    )
    const { trackId } = coordinator.addInstrumentTrack()
    const contentStateId = session.contentStateId

    expect(() =>
      coordinator.selectBuiltInInstrument(trackId, parseSoundbankId('unknown-soundbank')),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectTrackError>>({
        code: 'instrument-not-in-catalogue',
        soundbankId: parseSoundbankId('unknown-soundbank'),
      }),
    )
    expect(session.modelRevision).toBe(1)
    expect(session.contentStateId).toBe(contentStateId)
    expect(decodeStudioGrandDeviceState(session.getSnapshot().devices[0]!)).not.toBeNull()
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
