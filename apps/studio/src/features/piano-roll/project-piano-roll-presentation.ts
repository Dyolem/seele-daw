import {
  createPianoRollClipContext,
  createPianoRollTrackReadModel,
  type PianoRollClipContext,
  type PianoRollTrackReadModel,
} from '@seele-daw/editor'
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

/** Projects the selected Clip into the Studio-to-Editor composition boundary. */
export function createProjectPianoRollPresentation(
  snapshot: ProjectSnapshot,
  clipId: ClipId,
): ProjectPianoRollPresentation | null {
  const clip = snapshot.clips.find((candidate) => candidate.id === clipId)
  if (clip === undefined) return null

  const track = snapshot.tracks.find((candidate) => candidate.id === clip.trackId)
  const base = {
    clipId: clip.id,
    color: clip.color ?? track?.color ?? null,
    muted: clip.muted,
    name: clip.name,
    projectId: snapshot.project.id,
    startTick: clip.startTick,
    trackId: clip.trackId,
  }

  if (clip.loop !== null) {
    return Object.freeze({
      ...base,
      reason: 'looped-clip',
      status: PROJECT_PIANO_ROLL_PRESENTATION_STATUS.UNSUPPORTED,
    })
  }

  const source = snapshot.midiSources.find((candidate) => candidate.id === clip.sourceId)
  if (source === undefined) {
    throw new Error(`MIDI Clip ${clip.id} references missing source ${clip.sourceId}`)
  }

  return Object.freeze({
    ...base,
    context: createPianoRollClipContext(clip, source),
    snapshot,
    status: PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY,
  })
}

/** Projects the selected Track into the global-time Piano Roll composition boundary. */
export function createProjectPianoRollTrackPresentation(
  snapshot: ProjectSnapshot,
  trackId: TrackId,
  activeClipId: ClipId | null = null,
): ProjectPianoRollTrackPresentation | null {
  const track = snapshot.tracks.find((candidate) => candidate.id === trackId)
  if (track === undefined) return null

  const base = {
    color: track.color,
    muted: track.channel.muted,
    name: track.name,
    projectId: snapshot.project.id,
    trackId: track.id,
  }
  if (track.kind !== 'instrument') {
    return Object.freeze({
      ...base,
      reason: 'non-instrument-track',
      status: PROJECT_PIANO_ROLL_PRESENTATION_STATUS.UNSUPPORTED,
    })
  }

  return Object.freeze({
    ...base,
    readModel: createPianoRollTrackReadModel({
      activeClipId,
      snapshot,
      trackId: track.id,
    }),
    snapshot,
    status: PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY,
  })
}
