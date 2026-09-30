import type { PianoRollClipContext, PianoRollTrackReadModel } from '@seele-daw/editor'
import type {
  ClipId,
  ProjectColor,
  ProjectId,
  ProjectSnapshot,
  Tick,
  TrackId,
} from '@seele-daw/project-core'

export const PROJECT_PIANO_ROLL_PRESENTATION_STATUS = Object.freeze({
  READY: 'ready',
  UNSUPPORTED: 'unsupported',
} as const)

export type ProjectPianoRollPresentationStatus =
  (typeof PROJECT_PIANO_ROLL_PRESENTATION_STATUS)[keyof typeof PROJECT_PIANO_ROLL_PRESENTATION_STATUS]

interface ProjectPianoRollPresentationBase {
  readonly clipId: ClipId
  readonly color: ProjectColor | null
  readonly muted: boolean
  readonly name: string
  readonly projectId: ProjectId
  readonly startTick: Tick
  readonly trackId: TrackId
}

export interface ReadyProjectPianoRollPresentation extends ProjectPianoRollPresentationBase {
  readonly context: PianoRollClipContext
  /** Immutable authority used by synchronous controller-lane projections. */
  readonly snapshot: ProjectSnapshot
  readonly status: typeof PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY
}

export interface UnsupportedProjectPianoRollPresentation extends ProjectPianoRollPresentationBase {
  readonly reason: 'looped-clip'
  readonly status: typeof PROJECT_PIANO_ROLL_PRESENTATION_STATUS.UNSUPPORTED
}

export type ProjectPianoRollPresentation =
  | ReadyProjectPianoRollPresentation
  | UnsupportedProjectPianoRollPresentation

interface ProjectPianoRollTrackPresentationBase {
  readonly color: ProjectColor | null
  readonly muted: boolean
  readonly name: string
  readonly projectId: ProjectId
  readonly trackId: TrackId
}

export interface ReadyProjectPianoRollTrackPresentation extends ProjectPianoRollTrackPresentationBase {
  readonly readModel: PianoRollTrackReadModel
  /** Immutable authority used by synchronous controller-lane projections. */
  readonly snapshot: ProjectSnapshot
  readonly status: typeof PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY
}

export interface UnsupportedProjectPianoRollTrackPresentation extends ProjectPianoRollTrackPresentationBase {
  readonly reason: 'non-instrument-track'
  readonly status: typeof PROJECT_PIANO_ROLL_PRESENTATION_STATUS.UNSUPPORTED
}

export type ProjectPianoRollTrackPresentation =
  | ReadyProjectPianoRollTrackPresentation
  | UnsupportedProjectPianoRollTrackPresentation
