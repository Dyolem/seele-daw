import type {
  ClipId,
  MidiSourceId,
  Tick,
  TrackId,
} from '@seele-daw/project-core'

export type ProjectMidiNoteErrorCode =
  | 'active-project-not-ready'
  | 'note-start-outside-clip'
  | 'target-clip-not-found'
  | 'target-clip-source-invalid'
  | 'target-clip-looped'
  | 'target-midi-note-partition-not-found'
  | 'target-midi-source-not-found'
  | 'track-note-placement-blocked'
  | 'track-note-placement-stale'

export interface ProjectMidiNoteErrorDetails {
  readonly clipId?: ClipId
  readonly clipSpanTick?: Tick
  readonly clipStartTick?: Tick
  readonly phase?: string
  readonly sourceId?: MidiSourceId
  readonly trackId?: TrackId
}

/** Stable Studio failures raised before a MIDI Note Command reaches Project Core. */
export class ProjectMidiNoteError extends Error {
  readonly code: ProjectMidiNoteErrorCode
  readonly clipId: ClipId | null
  readonly clipSpanTick: Tick | null
  readonly clipStartTick: Tick | null
  readonly phase: string | null
  readonly sourceId: MidiSourceId | null
  readonly trackId: TrackId | null

  constructor(
    code: ProjectMidiNoteErrorCode,
    message: string,
    details: ProjectMidiNoteErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectMidiNoteError'
    this.code = code
    this.clipId = details.clipId ?? null
    this.clipSpanTick = details.clipSpanTick ?? null
    this.clipStartTick = details.clipStartTick ?? null
    this.phase = details.phase ?? null
    this.sourceId = details.sourceId ?? null
    this.trackId = details.trackId ?? null
  }
}
