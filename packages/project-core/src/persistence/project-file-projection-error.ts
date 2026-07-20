export type ProjectFileProjectionErrorCode =
  | 'duplicate-entity-id'
  | 'duplicate-midi-note-partition'
  | 'invalid-device-json'
  | 'midi-note-partition-missing'
  | 'orphan-midi-note-partition'
  | 'unsupported-record-kind'

export interface ProjectFileProjectionErrorDetails {
  readonly entityId?: string
  readonly entityKind?: string
  readonly recordKind?: string
  readonly sourceId?: string
}

/** Raised when a Snapshot cannot be represented truthfully as ProjectFileDTO V1. */
export class ProjectFileProjectionError extends Error {
  readonly code: ProjectFileProjectionErrorCode
  readonly entityId: string | null
  readonly entityKind: string | null
  readonly recordKind: string | null
  readonly sourceId: string | null

  constructor(
    code: ProjectFileProjectionErrorCode,
    message: string,
    details: ProjectFileProjectionErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectFileProjectionError'
    this.code = code
    this.entityId = details.entityId ?? null
    this.entityKind = details.entityKind ?? null
    this.recordKind = details.recordKind ?? null
    this.sourceId = details.sourceId ?? null
  }
}
