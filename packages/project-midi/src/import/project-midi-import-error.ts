import type { ProjectMidiImportEntityKind } from '#internal/import/project-midi-import-contract'

export type ProjectMidiImportErrorCode =
  | 'duplicate-generated-id'
  | 'identity-factory-failed'
  | 'instrument-device-factory-failed'
  | 'invalid-midi-document'
  | 'no-importable-tracks'
  | 'project-validation-failed'
  | 'tick-conversion-overflow'
  | 'unsupported-tempo'
  | 'unsupported-time-signature'

export interface ProjectMidiImportErrorDetails {
  readonly entityKind?: ProjectMidiImportEntityKind
  readonly sourceTrackIndex?: number
  readonly sourceTick?: number
  readonly value?: unknown
}

export class ProjectMidiImportError extends Error {
  readonly code: ProjectMidiImportErrorCode
  readonly details: ProjectMidiImportErrorDetails

  constructor(
    code: ProjectMidiImportErrorCode,
    message: string,
    details: ProjectMidiImportErrorDetails = {},
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ProjectMidiImportError'
    this.code = code
    this.details = Object.freeze({ ...details })
  }
}
