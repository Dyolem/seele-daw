export type ProjectFileLoadPathSegment = string | number

export type ProjectFileLoadErrorCode = 'invalid-domain-value' | 'model-invariants-violated'

export interface ProjectFileLoadErrorDetails {
  readonly cause: unknown
  readonly path?: readonly ProjectFileLoadPathSegment[]
}

/** Raised after V1 structure decoding when project data cannot form a valid runtime model. */
export class ProjectFileLoadError extends Error {
  readonly code: ProjectFileLoadErrorCode
  readonly path: readonly ProjectFileLoadPathSegment[]
  readonly failureCause: unknown

  constructor(
    code: ProjectFileLoadErrorCode,
    message: string,
    details: ProjectFileLoadErrorDetails,
  ) {
    super(message, { cause: details.cause })
    this.name = 'ProjectFileLoadError'
    this.code = code
    this.path = Object.freeze([...(details.path ?? [])])
    this.failureCause = details.cause
  }
}
