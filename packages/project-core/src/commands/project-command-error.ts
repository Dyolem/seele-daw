import type {
  DeviceId,
  MidiSourceId,
  NoteId,
  TrackId,
} from '#internal/model/ids'
import type { ModelRevision } from '#internal/model/model-revision'
import type { Tick } from '#internal/time/tick'

export type ProjectCommandErrorCode =
  | 'base-revision-mismatch'
  | 'device-id-already-exists'
  | 'invalid-base-revision'
  | 'invalid-track-order-index'
  | 'midi-note-not-found'
  | 'midi-note-partition-missing'
  | 'midi-source-not-found'
  | 'note-id-already-exists'
  | 'note-out-of-source-range'
  | 'track-id-already-exists'
  | 'track-order-index-out-of-bounds'
  | 'unknown-command-type'

export interface ProjectCommandErrorDetails {
  readonly baseRevision?: number
  readonly commandType?: string
  readonly currentRevision?: ModelRevision
  readonly deviceId?: DeviceId
  readonly insertAt?: number
  readonly noteEndTick?: Tick
  readonly noteId?: NoteId
  readonly sourceId?: MidiSourceId
  readonly sourceLengthTick?: Tick
  readonly trackId?: TrackId
  readonly trackOrderLength?: number
}

/** Raised when a product command cannot be constructed or prepared against the model. */
export class ProjectCommandError extends Error {
  readonly code: ProjectCommandErrorCode
  readonly baseRevision: number | null
  readonly commandType: string | null
  readonly currentRevision: ModelRevision | null
  readonly deviceId: DeviceId | null
  readonly insertAt: number | null
  readonly noteEndTick: Tick | null
  readonly noteId: NoteId | null
  readonly sourceId: MidiSourceId | null
  readonly sourceLengthTick: Tick | null
  readonly trackId: TrackId | null
  readonly trackOrderLength: number | null

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
    this.deviceId = details.deviceId ?? null
    this.insertAt = details.insertAt ?? null
    this.noteEndTick = details.noteEndTick ?? null
    this.noteId = details.noteId ?? null
    this.sourceId = details.sourceId ?? null
    this.sourceLengthTick = details.sourceLengthTick ?? null
    this.trackId = details.trackId ?? null
    this.trackOrderLength = details.trackOrderLength ?? null
  }
}
