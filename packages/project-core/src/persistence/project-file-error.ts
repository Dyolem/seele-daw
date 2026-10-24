export type ProjectFilePathSegment = string | number

export type ProjectFileErrorCode =
  | 'duplicate-id'
  | 'invalid-model'
  | 'invalid-structure'
  | 'invalid-value'
  | 'not-json'
  | 'project-id-mismatch'
  | 'unsupported-format-version'

/** Raised when a stored or imported project file, or the Checkpoint around it, cannot be read. */
export class ProjectFileError extends Error {
  readonly code: ProjectFileErrorCode
  /** Where the problem is in the input, e.g. `["midiNotes", "source-1", 3]`. */
  readonly path: readonly ProjectFilePathSegment[]

  constructor(
    code: ProjectFileErrorCode,
    message: string,
    path: readonly ProjectFilePathSegment[] = [],
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ProjectFileError'
    this.code = code
    this.path = Object.freeze([...path])
  }
}
