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
  const source = snapshot.midiSources.find((candidate) => candidate.id === clip.sourceId)!
  return Object.freeze({
    clipId: clip.id,
    color: clip.color ?? track?.color ?? null,
    context: createPianoRollClipContext(clip, source),
    muted: clip.muted,
    name: clip.name,
    projectId: snapshot.project.id,
    snapshot,
    startTick: clip.startTick,
    trackId: clip.trackId,
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

  return Object.freeze({
    color: track.color,
    muted: track.channel.muted,
    name: track.name,
    projectId: snapshot.project.id,
    readModel: createPianoRollTrackReadModel({ activeClipId, snapshot, trackId: track.id }),
    snapshot,
    trackId: track.id,
  })
}
