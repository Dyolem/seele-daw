/** Why one stored candidate could not be restored. */
export interface ProjectCheckpointCandidateFailure {
  readonly candidateIndex: number
  readonly failureCause: unknown
}

export type ProjectCheckpointErrorCode =
  | 'no-valid-checkpoint'
  | 'store-read-failed'
  | 'store-write-failed'

export interface ProjectCheckpointErrorDetails {
  readonly candidateFailures?: readonly ProjectCheckpointCandidateFailure[]
  readonly cause?: unknown
}

/** Raised when saving or restoring a Checkpoint cannot complete. */
export class ProjectCheckpointError extends Error {
  readonly code: ProjectCheckpointErrorCode
  /** Every rejected candidate, in the order they were tried. */
  readonly candidateFailures: readonly ProjectCheckpointCandidateFailure[]

  constructor(
    code: ProjectCheckpointErrorCode,
    message: string,
    details: ProjectCheckpointErrorDetails = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = 'ProjectCheckpointError'
    this.code = code
    this.candidateFailures = Object.freeze(
      (details.candidateFailures ?? []).map((failure) => Object.freeze({ ...failure })),
    )
  }
}
