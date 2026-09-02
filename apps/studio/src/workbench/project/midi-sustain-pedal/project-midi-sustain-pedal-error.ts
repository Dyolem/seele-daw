import type { ClipId, MidiSourceId, Tick, TrackId } from '@seele-daw/project-core'

export type ProjectMidiSustainPedalErrorCode =
  | 'active-project-not-ready'
  | 'clip-placement-stale'
  | 'event-edit-stale'
  | 'target-clip-looped'
  | 'target-clip-not-found'
  | 'target-clip-outside-track'
  | 'target-midi-source-not-found'
  | 'target-sustain-pedal-partition-not-found'
  | 'timeline-tick-outside-clip'
  | 'track-active-clip-required'
  | 'track-not-found'
  | 'track-not-instrument'
  | 'track-placement-stale'

export interface ProjectMidiSustainPedalErrorDetails {
  readonly clipEndTick?: Tick
  readonly clipId?: ClipId
  readonly clipStartTick?: Tick
  readonly phase?: string
  readonly sourceId?: MidiSourceId
  readonly timelineTick?: Tick
  readonly trackId?: TrackId
}

/** Stable Studio failures raised before a CC64 Command reaches Project Core. */
export class ProjectMidiSustainPedalError extends Error {
  readonly code: ProjectMidiSustainPedalErrorCode
  readonly clipEndTick: Tick | null
  readonly clipId: ClipId | null
  readonly clipStartTick: Tick | null
  readonly phase: string | null
  readonly sourceId: MidiSourceId | null
  readonly timelineTick: Tick | null
  readonly trackId: TrackId | null

  constructor(
    code: ProjectMidiSustainPedalErrorCode,
    message: string,
    details: ProjectMidiSustainPedalErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectMidiSustainPedalError'
    this.code = code
    this.clipEndTick = details.clipEndTick ?? null
    this.clipId = details.clipId ?? null
    this.clipStartTick = details.clipStartTick ?? null
    this.phase = details.phase ?? null
    this.sourceId = details.sourceId ?? null
    this.timelineTick = details.timelineTick ?? null
    this.trackId = details.trackId ?? null
  }
}
