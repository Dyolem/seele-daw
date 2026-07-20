export type ProjectQueryErrorCode =
  | 'invalid-pitch-range'
  | 'invalid-tick-range'
  | 'unknown-query-type'

export interface ProjectQueryErrorDetails {
  readonly endTick?: number
  readonly maximumPitch?: number
  readonly minimumPitch?: number
  readonly queryType?: string
  readonly startTick?: number
}

/** Raised when a read-only ProjectQuery cannot be normalized safely. */
export class ProjectQueryError extends Error {
  readonly code: ProjectQueryErrorCode
  readonly endTick: number | null
  readonly maximumPitch: number | null
  readonly minimumPitch: number | null
  readonly queryType: string | null
  readonly startTick: number | null

  constructor(
    code: ProjectQueryErrorCode,
    message: string,
    details: ProjectQueryErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectQueryError'
    this.code = code
    this.endTick = details.endTick ?? null
    this.maximumPitch = details.maximumPitch ?? null
    this.minimumPitch = details.minimumPitch ?? null
    this.queryType = details.queryType ?? null
    this.startTick = details.startTick ?? null
  }
}
