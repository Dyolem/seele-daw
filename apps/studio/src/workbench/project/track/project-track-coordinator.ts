import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddInstrumentTrackCommand,
  createReplaceInstrumentDeviceCommand,
  parseBipolarValue,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseTrackId,
  type InstrumentTrackRecord,
  type ProjectCommit,
  type ProjectCommandExecutionResult,
  type ProjectSnapshot,
  type TrackId,
} from '@seele-daw/project-core'
import { createStudioGrandDeviceDescriptor } from '@seele-daw/playback'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import { ProjectTrackError } from '@/workbench/project/track/project-track-error'
import { selectProjectTrackColor } from '@/workbench/project/track/project-track-palette'

export const INSTRUMENT_SLOT_DEVICE_TYPE_ID = parseDeviceTypeId('seele.instrument-slot')

export interface ProjectTrackCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'state'>
  readonly createUniqueId: () => string
  readonly createRandomValue: () => number
}

export interface ProjectTrackCoordinator {
  addInstrumentTrack(): AddedInstrumentTrackResult
  useStudioGrand(trackId: TrackId): ProjectCommandExecutionResult
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
      instrumentDevice: createStudioGrandDeviceDescriptor(
        parseDeviceId(this.#dependencies.createUniqueId()),
      ),
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

  useStudioGrand(trackId: TrackId): ProjectCommandExecutionResult {
    const activeState = this.#dependencies.activeProject.state

    if (activeState.phase !== ACTIVE_PROJECT_PHASE.READY) {
      throw new ProjectTrackError(
        'active-project-not-ready',
        `Cannot select Studio Grand while the Active Project is ${activeState.phase}`,
        { phase: activeState.phase },
      )
    }

    const track = activeState.session
      .getSnapshot()
      .tracks.find((candidate) => candidate.id === trackId)

    if (track === undefined) {
      throw new ProjectTrackError(
        'track-not-found',
        `Cannot select Studio Grand because Track ${trackId} does not exist`,
        { trackId },
      )
    }

    if (track.kind !== 'instrument') {
      throw new ProjectTrackError(
        'instrument-track-kind-mismatch',
        `Cannot select Studio Grand for ${track.kind} Track ${trackId}`,
        { trackId, trackKind: track.kind },
      )
    }

    return activeState.session.execute(
      createReplaceInstrumentDeviceCommand({
        baseRevision: activeState.session.modelRevision,
        trackId: track.id,
        instrumentDevice: createStudioGrandDeviceDescriptor(track.instrumentDeviceId),
      }),
    )
  }
}

/** Creates one framework-neutral Track command coordinator for the Active Project. */
export function createProjectTrackCoordinator(
  dependencies: ProjectTrackCoordinatorDependencies,
): ProjectTrackCoordinator {
  return Object.freeze(new ProjectTrackCoordinatorImpl(dependencies))
}
