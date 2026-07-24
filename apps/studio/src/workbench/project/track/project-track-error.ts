export type ProjectTrackErrorCode = 'active-project-not-ready' | 'invalid-random-value'

export interface ProjectTrackErrorDetails {
  readonly phase?: string
  readonly randomValue?: number
}

/** Stable Studio failures raised before a Track Command reaches Project Core. */
export class ProjectTrackError extends Error {
  readonly code: ProjectTrackErrorCode
  readonly phase: string | null
  readonly randomValue: number | null

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
  }
}
