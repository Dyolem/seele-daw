import type { PianoRollClipContext, PianoRollTrackReadModel } from '@seele-daw/editor'
import type {
  ClipId,
  ProjectColor,
  ProjectId,
  ProjectSnapshot,
  Tick,
  TrackId,
} from '@seele-daw/project-core'

/** The selected Clip, as the Clip Focus Piano Roll edits it. */
export interface ProjectPianoRollPresentation {
  readonly clipId: ClipId
  readonly color: ProjectColor | null
  readonly context: PianoRollClipContext
  readonly muted: boolean
  readonly name: string
  readonly projectId: ProjectId
  /** Immutable authority used by synchronous controller-lane projections. */
  readonly snapshot: ProjectSnapshot
  readonly startTick: Tick
  readonly trackId: TrackId
}

/** The selected Track, as the Track Piano Roll edits it across all of its Clips. */
export interface ProjectPianoRollTrackPresentation {
  readonly color: ProjectColor | null
  readonly muted: boolean
  readonly name: string
  readonly projectId: ProjectId
  readonly readModel: PianoRollTrackReadModel
  /** Immutable authority used by synchronous controller-lane projections. */
  readonly snapshot: ProjectSnapshot
  readonly trackId: TrackId
}
