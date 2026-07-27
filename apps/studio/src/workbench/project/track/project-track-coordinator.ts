import {
  DEVICE_DEFINITION_VERSION_MIN,
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddInstrumentTrackCommand,
  parseBipolarValue,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseTrackId,
  type InstrumentTrackRecord,
  type ProjectCommit,
  type ProjectSnapshot,
  type TrackId,
} from '@seele-daw/project-core'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import { ProjectTrackError } from '@/workbench/project/track/project-track-error'
import {
  selectProjectTrackColor,
} from '@/workbench/project/track/project-track-palette'

export const INSTRUMENT_SLOT_DEVICE_TYPE_ID = parseDeviceTypeId('seele.instrument-slot')

export interface ProjectTrackCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'state'>
  readonly createUniqueId: () => string
  readonly createRandomValue: () => number
}

export interface ProjectTrackCoordinator {
  addInstrumentTrack(): AddedInstrumentTrackResult
}

/** Identifies the committed Track so transient Workbench state can select it. */
export interface AddedInstrumentTrackResult {
  readonly commit: ProjectCommit
  readonly trackId: TrackId
}

function orderedTracks(snapshot: ProjectSnapshot): readonly InstrumentTrackRecord[] {
  const trackById = new Map(snapshot.tracks.map((track) => [track.id, track] as const))
  const tracks: InstrumentTrackRecord[] = []

  for (const trackId of snapshot.trackOrder) {
    const track = trackById.get(trackId)
    if (track?.kind === 'instrument') tracks.push(track)
  }

  return tracks
}

class ProjectTrackCoordinatorImpl implements ProjectTrackCoordinator {
  readonly #dependencies: ProjectTrackCoordinatorDependencies

  constructor(dependencies: ProjectTrackCoordinatorDependencies) {
    this.#dependencies = dependencies
  }

  addInstrumentTrack(): AddedInstrumentTrackResult {
    const activeState = this.#dependencies.activeProject.state

    if (activeState.phase !== ACTIVE_PROJECT_PHASE.READY) {
      throw new ProjectTrackError(
        'active-project-not-ready',
        `Cannot add an Instrument Track while the Active Project is ${activeState.phase}`,
        { phase: activeState.phase },
      )
    }

    const session = activeState.session
    const snapshot = session.getSnapshot()
    const instrumentTracks = orderedTracks(snapshot)
    const adjacentTrackId = snapshot.trackOrder.at(-1)
    const adjacentTrack =
      adjacentTrackId === undefined
        ? undefined
        : snapshot.tracks.find((track) => track.id === adjacentTrackId)
    const color = selectProjectTrackColor(
      this.#dependencies.createRandomValue(),
      adjacentTrack?.color ?? null,
    )
    const trackId = parseTrackId(this.#dependencies.createUniqueId())
    const command = createAddInstrumentTrackCommand({
      baseRevision: session.modelRevision,
      trackId,
      name: `Instrument ${instrumentTracks.length + 1}`,
      color,
      channel: {
        gain: parseLinearGain(1),
        pan: parseBipolarValue(0),
        muted: false,
        soloed: false,
      },
      instrumentDevice: {
        id: parseDeviceId(this.#dependencies.createUniqueId()),
        typeId: INSTRUMENT_SLOT_DEVICE_TYPE_ID,
        definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
        enabled: true,
        parameters: {},
        opaqueState: null,
      },
      insertAt: snapshot.trackOrder.length,
    })
    const result = session.execute(command)

    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('AddInstrumentTrackCommand unexpectedly produced no Project change')
    }

    return Object.freeze({
      commit: result.commit,
      trackId,
    })
  }
}

/** Creates one framework-neutral Track command coordinator for the Active Project. */
export function createProjectTrackCoordinator(
  dependencies: ProjectTrackCoordinatorDependencies,
): ProjectTrackCoordinator {
  return Object.freeze(new ProjectTrackCoordinatorImpl(dependencies))
}
