export type ProjectCheckpointValidationPathSegment = string | number

export type ProjectCheckpointValidationErrorCode =
  | 'invalid-checkpoint-id'
  | 'invalid-object-property'
  | 'invalid-project-file'
  | 'invalid-project-id'
  | 'invalid-source-model-revision'
  | 'invalid-type'
  | 'missing-property'
  | 'project-id-mismatch'
  | 'unexpected-property'
  | 'unsupported-checkpoint-format-version'

export interface ProjectCheckpointValidationErrorDetails {
  readonly actual?: string
  readonly cause?: unknown
  readonly expected?: string
  readonly path?: readonly ProjectCheckpointValidationPathSegment[]
}

/** Raised when an untrusted value cannot be decoded as a Project Checkpoint. */
export class ProjectCheckpointValidationError extends Error {
  readonly code: ProjectCheckpointValidationErrorCode
  readonly path: readonly ProjectCheckpointValidationPathSegment[]
  readonly expected: string | null
  readonly actual: string | null
  readonly failureCause: unknown

  constructor(
    code: ProjectCheckpointValidationErrorCode,
    message: string,
    details: ProjectCheckpointValidationErrorDetails = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = 'ProjectCheckpointValidationError'
    this.code = code
    this.path = Object.freeze([...(details.path ?? [])])
    this.expected = details.expected ?? null
    this.actual = details.actual ?? null
    this.failureCause = details.cause
  }
}

export interface ProjectCheckpointCandidateFailure {
  readonly candidateIndex: number
  readonly failureCause: unknown
}

export type ProjectCheckpointOperationErrorCode =
  | 'no-valid-checkpoint'
  | 'store-read-failed'
  | 'store-write-failed'

export interface ProjectCheckpointOperationErrorDetails {
  readonly candidateFailures?: readonly ProjectCheckpointCandidateFailure[]
  readonly cause?: unknown
}

/** Raised when Checkpoint storage or recovery orchestration cannot complete. */
export class ProjectCheckpointOperationError extends Error {
  readonly code: ProjectCheckpointOperationErrorCode
  readonly candidateFailures: readonly ProjectCheckpointCandidateFailure[]
  readonly failureCause: unknown

  constructor(
    code: ProjectCheckpointOperationErrorCode,
    message: string,
    details: ProjectCheckpointOperationErrorDetails = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = 'ProjectCheckpointOperationError'
    this.code = code
    this.candidateFailures = Object.freeze(
      (details.candidateFailures ?? []).map((failure) => Object.freeze({ ...failure })),
    )
    this.failureCause = details.cause
  }
}
