import type { TrackId } from '@seele-daw/project-core'
import type { SoundbankId } from '@seele-daw/playback'

export type ProjectTrackErrorCode =
  | 'active-project-not-ready'
  | 'instrument-not-in-catalogue'
  | 'instrument-track-kind-mismatch'
  | 'invalid-random-value'
  | 'track-not-found'

export interface ProjectTrackErrorDetails {
  readonly phase?: string
  readonly randomValue?: number
  readonly soundbankId?: SoundbankId
  readonly trackId?: TrackId
  readonly trackKind?: string
}

/** Stable Studio failures raised before a Track Command reaches Project Core. */
export class ProjectTrackError extends Error {
  readonly code: ProjectTrackErrorCode
  readonly phase: string | null
  readonly randomValue: number | null
  readonly soundbankId: SoundbankId | null
  readonly trackId: TrackId | null
  readonly trackKind: string | null

  constructor(
    code: ProjectTrackErrorCode,
    message: string,
    details: ProjectTrackErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectTrackError'
    this.code = code
    this.phase = details.phase ?? null
    this.randomValue = details.randomValue ?? null
    this.soundbankId = details.soundbankId ?? null
    this.trackId = details.trackId ?? null
    this.trackKind = details.trackKind ?? null
  }
}
