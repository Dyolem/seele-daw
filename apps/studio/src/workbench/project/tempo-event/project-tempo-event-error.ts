export type ProjectTempoEventErrorCode =
  | 'active-project-not-ready'
  | 'missing-context'
  | 'tempo-event-add-produced-no-change'

export interface ProjectTempoEventErrorDetails {
  readonly phase?: string
}

/** Stable Studio application error for Tempo Event command coordination failures. */
export class ProjectTempoEventError extends Error {
  readonly code: ProjectTempoEventErrorCode
  readonly phase: string | null

  constructor(
    code: ProjectTempoEventErrorCode,
    message: string,
    details: ProjectTempoEventErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectTempoEventError'
    this.code = code
    this.phase = details.phase ?? null
  }
}
