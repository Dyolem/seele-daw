import { PROJECT_PIANO_ROLL_PRESENTATION_STATUS } from '@/features/piano-roll/types/piano-roll-presentation'
import type {
  ProjectPianoRollPresentation,
  ProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/types/piano-roll-presentation'
import { createPianoRollClipContext, createPianoRollTrackReadModel } from '@seele-daw/editor'
import type { ClipId, ProjectSnapshot, TrackId } from '@seele-daw/project-core'

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
