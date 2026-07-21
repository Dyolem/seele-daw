export type ProjectFileValidationPathSegment = string | number

export type ProjectFileValidationErrorCode =
  | 'cyclic-value'
  | 'duplicate-required-feature'
  | 'entity-key-id-mismatch'
  | 'invalid-integer'
  | 'invalid-json-value'
  | 'invalid-literal'
  | 'invalid-number'
  | 'invalid-object-property'
  | 'invalid-type'
  | 'invalid-value'
  | 'missing-property'
  | 'unexpected-property'
  | 'unsupported-format-version'
  | 'unsupported-required-feature'

export interface ProjectFileValidationErrorDetails {
  readonly actual?: string
  readonly cause?: unknown
  readonly entityId?: string
  readonly expected?: string
  readonly featureId?: string
  readonly path?: readonly ProjectFileValidationPathSegment[]
  readonly tableKey?: string
}

/** Raised when an untrusted value cannot be decoded as the current project file format. */
export class ProjectFileValidationError extends Error {
  readonly code: ProjectFileValidationErrorCode
  readonly path: readonly ProjectFileValidationPathSegment[]
  readonly expected: string | null
  readonly actual: string | null
  readonly featureId: string | null
  readonly tableKey: string | null
  readonly entityId: string | null
  readonly failureCause: unknown

  constructor(
    code: ProjectFileValidationErrorCode,
    message: string,
    details: ProjectFileValidationErrorDetails = {},
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause })
    this.name = 'ProjectFileValidationError'
    this.code = code
    this.path = Object.freeze([...(details.path ?? [])])
    this.expected = details.expected ?? null
    this.actual = details.actual ?? null
    this.featureId = details.featureId ?? null
    this.tableKey = details.tableKey ?? null
    this.entityId = details.entityId ?? null
    this.failureCause = details.cause
  }
}
