import type { MidiSourceId, NoteId } from '@/model/ids'
import type { ModelRevision } from '@/model/model-revision'
import type { Tick } from '@/time/tick'

export type ProjectCommandErrorCode =
  | 'base-revision-mismatch'
  | 'invalid-base-revision'
  | 'midi-note-not-found'
  | 'midi-note-partition-missing'
  | 'midi-source-not-found'
  | 'note-id-already-exists'
  | 'note-out-of-source-range'
  | 'unknown-command-type'

export interface ProjectCommandErrorDetails {
  readonly baseRevision?: number
  readonly commandType?: string
  readonly currentRevision?: ModelRevision
  readonly noteEndTick?: Tick
  readonly noteId?: NoteId
  readonly sourceId?: MidiSourceId
  readonly sourceLengthTick?: Tick
}

/** Raised when a product command cannot be constructed or prepared against the model. */
export class ProjectCommandError extends Error {
  readonly code: ProjectCommandErrorCode
  readonly baseRevision: number | null
  readonly commandType: string | null
  readonly currentRevision: ModelRevision | null
  readonly noteEndTick: Tick | null
  readonly noteId: NoteId | null
  readonly sourceId: MidiSourceId | null
  readonly sourceLengthTick: Tick | null

  constructor(
    code: ProjectCommandErrorCode,
    message: string,
    details: ProjectCommandErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectCommandError'
    this.code = code
    this.baseRevision = details.baseRevision ?? null
    this.commandType = details.commandType ?? null
    this.currentRevision = details.currentRevision ?? null
    this.noteEndTick = details.noteEndTick ?? null
    this.noteId = details.noteId ?? null
    this.sourceId = details.sourceId ?? null
    this.sourceLengthTick = details.sourceLengthTick ?? null
  }
}
