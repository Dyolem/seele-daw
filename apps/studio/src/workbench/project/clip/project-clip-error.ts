import type { TrackId } from '@seele-daw/project-core'

export type ProjectClipErrorCode =
  | 'active-project-not-ready'
  | 'initial-time-signature-missing'
  | 'target-track-not-found'
  | 'target-track-not-instrument'

export interface ProjectClipErrorDetails {
  readonly phase?: string
  readonly trackId?: TrackId
  readonly trackKind?: string
}

/** Stable Studio failures raised before an empty MIDI Clip Command reaches Project Core. */
export class ProjectClipError extends Error {
  readonly code: ProjectClipErrorCode
  readonly phase: string | null
  readonly trackId: TrackId | null
  readonly trackKind: string | null

  constructor(
    code: ProjectClipErrorCode,
    message: string,
    details: ProjectClipErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectClipError'
    this.code = code
    this.phase = details.phase ?? null
    this.trackId = details.trackId ?? null
    this.trackKind = details.trackKind ?? null
  }
}
