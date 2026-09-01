import {
  createPianoRollClipContext,
  createPianoRollTrackClipProjection,
  pianoRollClipTickToSourceTick,
  pianoRollTrackProjectTickToSourceTick,
  PIANO_ROLL_TRACK_CLIP_STATUS,
} from '@seele-daw/editor'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddMidiSustainPedalEventCommand,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiSustainPedalEventId,
  parseTick,
  type ClipId,
  type MidiChannel,
  type MidiControlValue,
  type MidiSustainPedalEventId,
  type ModelRevision,
  type ProjectCommit,
  type ProjectSession,
  type ProjectSnapshot,
  type Tick,
  type TrackId,
} from '@seele-daw/project-core'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import { ProjectMidiSustainPedalError } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-error'

export interface ProjectMidiSustainPedalCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'state'>
  readonly createUniqueId: () => string
}

export interface PlaceMidiSustainPedalEventInClipInput {
  readonly baseRevision: ModelRevision
  readonly channel: MidiChannel
  readonly clipId: ClipId
  readonly clipTick: Tick
  readonly value: MidiControlValue
}

export interface PlaceMidiSustainPedalEventOnTrackInput {
  readonly activeClipId: ClipId | null
  readonly baseRevision: ModelRevision
  readonly channel: MidiChannel
  readonly projectTick: Tick
  readonly trackId: TrackId
  readonly value: MidiControlValue
}

export interface PlacedMidiSustainPedalEventResult {
  readonly clipId: ClipId
  readonly commit: ProjectCommit
  readonly eventId: MidiSustainPedalEventId
}

export interface ProjectMidiSustainPedalCoordinator {
  placeInClip(input: PlaceMidiSustainPedalEventInClipInput): PlacedMidiSustainPedalEventResult
  placeOnTrack(input: PlaceMidiSustainPedalEventOnTrackInput): PlacedMidiSustainPedalEventResult
}

interface ReadyProjectAuthority {
  readonly session: ProjectSession
  readonly snapshot: ProjectSnapshot
}

function requireReadyProject(
  dependencies: ProjectMidiSustainPedalCoordinatorDependencies,
): ReadyProjectAuthority {
  const activeState = dependencies.activeProject.state
  if (activeState.phase !== ACTIVE_PROJECT_PHASE.READY) {
    throw new ProjectMidiSustainPedalError(
      'active-project-not-ready',
      `Cannot edit Sustain Pedal events while the Active Project is ${activeState.phase}`,
      { phase: activeState.phase },
    )
  }

  return Object.freeze({
    session: activeState.session,
    snapshot: activeState.session.getSnapshot(),
  })
}

function requireCurrentRevision(
  snapshot: ProjectSnapshot,
  baseRevision: ModelRevision,
  scope: 'clip' | 'track',
  details: { readonly clipId?: ClipId; readonly trackId?: TrackId },
): void {
  if (snapshot.modelRevision === baseRevision) return

  throw new ProjectMidiSustainPedalError(
    scope === 'clip' ? 'clip-placement-stale' : 'track-placement-stale',
    `The ${scope === 'clip' ? 'Clip' : 'Track'} changed before the Sustain Pedal event could be placed. Try the gesture again.`,
    details,
  )
}

function requireClip(snapshot: ProjectSnapshot, clipId: ClipId) {
  const clip = snapshot.clips.find((candidate) => candidate.id === clipId)
  if (clip === undefined) {
    throw new ProjectMidiSustainPedalError(
      'target-clip-not-found',
      `Cannot edit Sustain Pedal events because Clip ${clipId} does not exist`,
      { clipId },
    )
  }
  if (clip.loop !== null) {
    throw new ProjectMidiSustainPedalError(
      'target-clip-looped',
      `Cannot edit Sustain Pedal events because Clip ${clip.id} is looped`,
      { clipId: clip.id, sourceId: clip.sourceId, trackId: clip.trackId },
    )
  }
  return clip
}

function requireClipSource(snapshot: ProjectSnapshot, clip: ReturnType<typeof requireClip>) {
  const source = snapshot.midiSources.find((candidate) => candidate.id === clip.sourceId)
  if (source === undefined) {
    throw new ProjectMidiSustainPedalError(
      'target-midi-source-not-found',
      `Cannot edit Sustain Pedal events because MidiSource ${clip.sourceId} does not exist`,
      { clipId: clip.id, sourceId: clip.sourceId, trackId: clip.trackId },
    )
  }
  const hasPartition = snapshot.midiSustainPedalEventPartitions.some(
    (candidate) => candidate.sourceId === source.id,
  )
  if (!hasPartition) {
    throw new ProjectMidiSustainPedalError(
      'target-sustain-pedal-partition-not-found',
      `Cannot edit Sustain Pedal events because MidiSource ${source.id} has no CC64 partition`,
      { clipId: clip.id, sourceId: source.id, trackId: clip.trackId },
    )
  }
  return source
}

function executePlacement(
  dependencies: ProjectMidiSustainPedalCoordinatorDependencies,
  session: ProjectSession,
  input: {
    readonly baseRevision: ModelRevision
    readonly channel: MidiChannel
    readonly clipId: ClipId
    readonly sourceId: ReturnType<typeof requireClipSource>['id']
    readonly sourceTick: Tick
    readonly value: MidiControlValue
  },
): PlacedMidiSustainPedalEventResult {
  const eventId = parseMidiSustainPedalEventId(dependencies.createUniqueId())
  const result = session.execute(
    createAddMidiSustainPedalEventCommand({
      baseRevision: input.baseRevision,
      channel: parseMidiChannel(input.channel),
      eventId,
      sourceId: input.sourceId,
      tick: input.sourceTick,
      value: parseMidiControlValue(input.value),
    }),
  )
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Sustain Pedal event placement unexpectedly produced no Project change')
  }

  return Object.freeze({ clipId: input.clipId, commit: result.commit, eventId })
}

class ProjectMidiSustainPedalCoordinatorImpl implements ProjectMidiSustainPedalCoordinator {
  readonly #dependencies: ProjectMidiSustainPedalCoordinatorDependencies

  constructor(dependencies: ProjectMidiSustainPedalCoordinatorDependencies) {
    this.#dependencies = dependencies
  }

  placeInClip(input: PlaceMidiSustainPedalEventInClipInput): PlacedMidiSustainPedalEventResult {
    const { session, snapshot } = requireReadyProject(this.#dependencies)
    requireCurrentRevision(snapshot, input.baseRevision, 'clip', { clipId: input.clipId })
    const clip = requireClip(snapshot, input.clipId)
    const source = requireClipSource(snapshot, clip)
    const context = createPianoRollClipContext(clip, source)
    const clipTick = parseTick(input.clipTick)
    if (clipTick > context.clipSpanTick) {
      throw new ProjectMidiSustainPedalError(
        'timeline-tick-outside-clip',
        `Cannot place a Sustain Pedal event at Clip Tick ${clipTick}; Clip ${clip.id} ends at ${context.clipSpanTick}`,
        {
          clipEndTick: context.clipSpanTick,
          clipId: clip.id,
          clipStartTick: parseTick(0),
          timelineTick: clipTick,
          trackId: clip.trackId,
        },
      )
    }

    return executePlacement(this.#dependencies, session, {
      baseRevision: input.baseRevision,
      channel: input.channel,
      clipId: clip.id,
      sourceId: source.id,
      sourceTick: pianoRollClipTickToSourceTick(context, clipTick),
      value: input.value,
    })
  }

  placeOnTrack(input: PlaceMidiSustainPedalEventOnTrackInput): PlacedMidiSustainPedalEventResult {
    const { session, snapshot } = requireReadyProject(this.#dependencies)
    requireCurrentRevision(snapshot, input.baseRevision, 'track', { trackId: input.trackId })

    const track = snapshot.tracks.find((candidate) => candidate.id === input.trackId)
    if (track === undefined) {
      throw new ProjectMidiSustainPedalError(
        'track-not-found',
        `Cannot place a Sustain Pedal event because Track ${input.trackId} does not exist`,
        { trackId: input.trackId },
      )
    }
    if (track.kind !== 'instrument') {
      throw new ProjectMidiSustainPedalError(
        'track-not-instrument',
        `Cannot place a Sustain Pedal event on non-Instrument Track ${track.id}`,
        { trackId: track.id },
      )
    }
    if (input.activeClipId === null) {
      throw new ProjectMidiSustainPedalError(
        'track-active-clip-required',
        'Choose an Active Clip before adding Sustain Pedal events in Track Scope.',
        { trackId: track.id },
      )
    }

    const clip = requireClip(snapshot, input.activeClipId)
    if (clip.trackId !== track.id) {
      throw new ProjectMidiSustainPedalError(
        'target-clip-outside-track',
        `Active Clip ${clip.id} does not belong to Track ${track.id}`,
        { clipId: clip.id, sourceId: clip.sourceId, trackId: track.id },
      )
    }
    const source = requireClipSource(snapshot, clip)
    const projection = createPianoRollTrackClipProjection(clip, source)
    if (projection.status !== PIANO_ROLL_TRACK_CLIP_STATUS.READY) {
      throw new ProjectMidiSustainPedalError(
        'target-clip-looped',
        `Cannot edit Sustain Pedal events because Clip ${clip.id} is looped`,
        { clipId: clip.id, sourceId: source.id, trackId: track.id },
      )
    }
    const projectTick = parseTick(input.projectTick)
    if (projectTick < projection.startTick || projectTick > projection.endTick) {
      throw new ProjectMidiSustainPedalError(
        'timeline-tick-outside-clip',
        `Project Tick ${projectTick} is outside Active Clip ${clip.id} (${projection.startTick}–${projection.endTick})`,
        {
          clipEndTick: projection.endTick,
          clipId: clip.id,
          clipStartTick: projection.startTick,
          timelineTick: projectTick,
          trackId: track.id,
        },
      )
    }

    return executePlacement(this.#dependencies, session, {
      baseRevision: input.baseRevision,
      channel: input.channel,
      clipId: clip.id,
      sourceId: source.id,
      sourceTick: pianoRollTrackProjectTickToSourceTick(projection, projectTick),
      value: input.value,
    })
  }
}

/** Creates one framework-neutral CC64 command coordinator for the Active Project. */
export function createProjectMidiSustainPedalCoordinator(
  dependencies: ProjectMidiSustainPedalCoordinatorDependencies,
): ProjectMidiSustainPedalCoordinator {
  return Object.freeze(new ProjectMidiSustainPedalCoordinatorImpl(dependencies))
}
