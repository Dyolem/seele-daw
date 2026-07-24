import type {
  ProjectColor,
  ProjectSnapshot,
  TrackId,
  TrackRecord,
} from '@seele-daw/project-core'

export interface ProjectTrackPresentation {
  readonly color: ProjectColor | null
  readonly id: TrackId
  readonly kind: TrackRecord['kind']
  readonly name: string
}

/** Projects ordered Track facts into immutable, Vue-safe presentation values. */
export function createProjectTrackPresentations(
  snapshot: ProjectSnapshot,
): readonly ProjectTrackPresentation[] {
  const tracksById = new Map(snapshot.tracks.map((track) => [track.id, track] as const))
  const tracks: ProjectTrackPresentation[] = []

  for (const trackId of snapshot.trackOrder) {
    const track = tracksById.get(trackId)
    if (track === undefined) continue

    tracks.push(
      Object.freeze({
        color: track.color,
        id: track.id,
        kind: track.kind,
        name: track.name,
      }),
    )
  }

  return Object.freeze(tracks)
}
