import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  ZERO_TICK,
  createAddMidiClipCommand,
  parseClipId,
  parseMidiSourceId,
  type ClipId,
  type ProjectCommit,
  type Tick,
  type TrackId,
} from '@seele-daw/project-core'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import { createProjectClipBarRange } from '@/workbench/project/clip/project-clip-bar-range'
import { ProjectClipError } from '@/workbench/project/clip/project-clip-error'

export interface ProjectClipCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'state'>
  readonly createUniqueId: () => string
}

export interface AddEmptyMidiClipInput {
  readonly trackId: TrackId
  readonly targetTick: Tick
}

/** Identifies the committed Clip so Workbench Selection can follow it. */
export interface AddedMidiClipResult {
  readonly clipId: ClipId
  readonly commit: ProjectCommit
  readonly trackId: TrackId
}

export interface ProjectClipCoordinator {
  addEmptyMidiClip(input: AddEmptyMidiClipInput): AddedMidiClipResult
}

class ProjectClipCoordinatorImpl implements ProjectClipCoordinator {
  readonly #dependencies: ProjectClipCoordinatorDependencies

  constructor(dependencies: ProjectClipCoordinatorDependencies) {
    this.#dependencies = dependencies
  }

  addEmptyMidiClip(input: AddEmptyMidiClipInput): AddedMidiClipResult {
    const activeState = this.#dependencies.activeProject.state

    if (activeState.phase !== ACTIVE_PROJECT_PHASE.READY) {
      throw new ProjectClipError(
        'active-project-not-ready',
        `Cannot add a MIDI Clip while the Active Project is ${activeState.phase}`,
        { phase: activeState.phase },
      )
    }

    const session = activeState.session
    const snapshot = session.getSnapshot()
    const track = snapshot.tracks.find((candidate) => candidate.id === input.trackId)

    if (track === undefined) {
      throw new ProjectClipError(
        'target-track-not-found',
        `Cannot add a MIDI Clip because Track ${input.trackId} does not exist`,
        { trackId: input.trackId },
      )
    }

    if (track.kind !== 'instrument') {
      throw new ProjectClipError(
        'target-track-not-instrument',
        `Cannot add a MIDI Clip to non-Instrument Track ${track.id}`,
        { trackId: track.id, trackKind: track.kind },
      )
    }

    const barRange = createProjectClipBarRange(snapshot, input.targetTick)
    const clipId = parseClipId(this.#dependencies.createUniqueId())
    const sourceId = parseMidiSourceId(this.#dependencies.createUniqueId())
    const result = session.execute(
      createAddMidiClipCommand({
        baseRevision: session.modelRevision,
        clipId,
        trackId: track.id,
        name: track.name,
        color: null,
        muted: false,
        startTick: barRange.startTick,
        spanTick: barRange.spanTick,
        sourceId,
        sourceLengthTick: barRange.spanTick,
        sourceOffsetTick: ZERO_TICK,
        loop: null,
      }),
    )

    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('AddMidiClipCommand unexpectedly produced no Project change')
    }

    return Object.freeze({
      clipId,
      commit: result.commit,
      trackId: track.id,
    })
  }
}

/** Creates one framework-neutral empty MIDI Clip coordinator for the Active Project. */
export function createProjectClipCoordinator(
  dependencies: ProjectClipCoordinatorDependencies,
): ProjectClipCoordinator {
  return Object.freeze(new ProjectClipCoordinatorImpl(dependencies))
}
