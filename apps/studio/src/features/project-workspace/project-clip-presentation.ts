import type { ClipId, ProjectColor, ProjectSnapshot, Tick, TrackId } from '@seele-daw/project-core'

export interface ProjectMidiClipPresentation {
  readonly color: ProjectColor | null
  readonly id: ClipId
  readonly muted: boolean
  readonly name: string
  readonly spanTick: Tick
  readonly startTick: Tick
  readonly trackId: TrackId
}

function compareClipPresentations(
  left: ProjectMidiClipPresentation,
  right: ProjectMidiClipPresentation,
): number {
  if (left.startTick !== right.startTick) return left.startTick - right.startTick
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

/** Projects MIDI Clip facts and resolved Track color into immutable Vue-safe values. */
export function createProjectMidiClipPresentations(
  snapshot: ProjectSnapshot,
): readonly ProjectMidiClipPresentation[] {
  const trackColorById = new Map(snapshot.tracks.map((track) => [track.id, track.color] as const))
  const clips = snapshot.clips.map((clip) =>
    Object.freeze<ProjectMidiClipPresentation>({
      color: clip.color ?? trackColorById.get(clip.trackId) ?? null,
      id: clip.id,
      muted: clip.muted,
      name: clip.name,
      spanTick: clip.spanTick,
      startTick: clip.startTick,
      trackId: clip.trackId,
    }),
  )

  clips.sort(compareClipPresentations)
  return Object.freeze(clips)
}
