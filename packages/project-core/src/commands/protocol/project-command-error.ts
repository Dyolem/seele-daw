import type {
  ClipId,
  DeviceId,
  MidiSourceId,
  NoteId,
  TempoEventId,
  TrackId,
} from '#internal/model/ids'
import type { Tick } from '#internal/time/tick'
import type { ModelRevision } from '#internal/model/model-revision'

export type ProjectCommandErrorCode =
  | 'base-revision-mismatch'
  | 'clip-not-found'
  | 'clip-id-already-exists'
  | 'device-id-already-exists'
  | 'device-not-found'
  | 'duplicate-note-id'
  | 'empty-instrument-track-collection'
  | 'empty-note-id-list'
  | 'invalid-base-revision'
  | 'invalid-track-order-index'
  | 'instrument-device-id-mismatch'
  | 'instrument-device-track-kind-mismatch'
  | 'instrument-track-device-chain-unsupported'
  | 'midi-note-not-found'
  | 'midi-note-partition-already-exists'
  | 'midi-note-partition-missing'
  | 'midi-clip-out-of-source-range'
  | 'midi-clip-source-id-mismatch'
  | 'midi-clip-extension-crosses-next-clip'
  | 'midi-clip-extension-not-required'
  | 'midi-clip-extension-not-rightward'
  | 'midi-clip-extension-out-of-range'
  | 'midi-clip-track-kind-mismatch'
  | 'midi-source-id-already-exists'
  | 'midi-source-not-found'
  | 'looped-midi-clip-unsupported'
  | 'note-id-already-exists'
  | 'note-out-of-clip-range'
  | 'note-out-of-source-range'
  | 'note-pitch-out-of-range'
  | 'tempo-event-not-found'
  | 'track-id-already-exists'
  | 'track-not-found'
  | 'track-order-index-out-of-bounds'
  | 'unknown-command-type'

export interface ProjectCommandErrorDetails {
  readonly baseRevision?: number
  readonly blockingClipId?: ClipId
  readonly clipEndTick?: Tick
  readonly clipId?: ClipId
  readonly commandType?: string
  readonly currentRevision?: ModelRevision
  readonly deviceId?: DeviceId
  readonly insertAt?: number
  readonly noteEndTick?: Tick
  readonly noteId?: NoteId
  readonly notePitch?: number
  readonly noteStartTick?: number
  readonly sourceId?: MidiSourceId
  readonly sourceLengthTick?: Tick
  readonly sourceReadEndTick?: Tick
  readonly sourceReadStartTick?: Tick
  readonly targetSpanTick?: Tick
  readonly tempoEventId?: TempoEventId
  readonly trackId?: TrackId
  readonly trackKind?: string
  readonly trackOrderLength?: number
}

/** Raised when a product command cannot be constructed or prepared against the model. */
export class ProjectCommandError extends Error {
  readonly code: ProjectCommandErrorCode
  readonly baseRevision: number | null
  readonly blockingClipId: ClipId | null
  readonly clipEndTick: Tick | null
  readonly clipId: ClipId | null
  readonly commandType: string | null
  readonly currentRevision: ModelRevision | null
  readonly deviceId: DeviceId | null
  readonly insertAt: number | null
  readonly noteEndTick: Tick | null
  readonly noteId: NoteId | null
  readonly notePitch: number | null
  readonly noteStartTick: number | null
  readonly sourceId: MidiSourceId | null
  readonly sourceLengthTick: Tick | null
  readonly sourceReadEndTick: Tick | null
  readonly sourceReadStartTick: Tick | null
  readonly targetSpanTick: Tick | null
  readonly tempoEventId: TempoEventId | null
  readonly trackId: TrackId | null
  readonly trackKind: string | null
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
    this.blockingClipId = details.blockingClipId ?? null
    this.clipEndTick = details.clipEndTick ?? null
    this.clipId = details.clipId ?? null
    this.commandType = details.commandType ?? null
    this.currentRevision = details.currentRevision ?? null
    this.deviceId = details.deviceId ?? null
    this.insertAt = details.insertAt ?? null
    this.noteEndTick = details.noteEndTick ?? null
    this.noteId = details.noteId ?? null
    this.notePitch = details.notePitch ?? null
    this.noteStartTick = details.noteStartTick ?? null
    this.sourceId = details.sourceId ?? null
    this.sourceLengthTick = details.sourceLengthTick ?? null
    this.sourceReadEndTick = details.sourceReadEndTick ?? null
    this.sourceReadStartTick = details.sourceReadStartTick ?? null
    this.targetSpanTick = details.targetSpanTick ?? null
    this.tempoEventId = details.tempoEventId ?? null
    this.trackId = details.trackId ?? null
    this.trackKind = details.trackKind ?? null
    this.trackOrderLength = details.trackOrderLength ?? null
  }
}
