import type { Brand } from '@seele-daw/type-utils'
import type {
  BipolarValue,
  ClipId,
  DeviceId,
  DeviceTypeId,
  LinearGain,
  MidiChannel,
  MidiPitch,
  MidiSourceId,
  MidiVelocity,
  ModelRevision,
  NoteId,
  Tick,
  TrackId,
} from '@seele-daw/project-core'

import type { SoundbankId } from '#internal/device/sample-instrument-device'
import type { TempoSegmentPlan } from '#internal/time/tempo-map'

export const AUDIBLE_MIDI_PLAN_STATUS = Object.freeze({
  EMPTY: 'empty',
  PARTIAL: 'partial',
  PLAYABLE: 'playable',
} as const)

export type AudibleMidiPlanStatus =
  (typeof AUDIBLE_MIDI_PLAN_STATUS)[keyof typeof AUDIBLE_MIDI_PLAN_STATUS]

export type NoteOccurrenceKey = Brand<string, 'NoteOccurrenceKey'>

export type PlaybackDiagnosticSeverity = 'info' | 'warning'

export type PlaybackDiagnosticCode =
  | 'instrument-disabled'
  | 'instrument-runtime-missing'
  | 'invalid-sample-instrument-state'
  | 'no-audible-midi-note-spans'

export interface PlaybackDiagnostic {
  readonly code: PlaybackDiagnosticCode
  readonly severity: PlaybackDiagnosticSeverity
  readonly trackId: TrackId | null
  readonly clipId: ClipId | null
  readonly deviceId: DeviceId | null
  readonly deviceTypeId: DeviceTypeId | null
}

export interface SampleInstrumentPlan {
  readonly kind: 'sample-instrument'
  readonly deviceId: DeviceId
  readonly soundbankId: SoundbankId
}

export interface MasterChannelPlan {
  readonly gain: LinearGain
  readonly muted: boolean
}

export interface TrackPlaybackPlan {
  readonly trackId: TrackId
  readonly instrumentDeviceId: DeviceId
  readonly instrument: SampleInstrumentPlan
  readonly gain: LinearGain
  readonly pan: BipolarValue
  readonly muted: boolean
  readonly soloed: boolean
  readonly audible: boolean
}

export interface MidiNoteSpanPlan {
  readonly occurrenceKey: NoteOccurrenceKey
  readonly trackId: TrackId
  readonly clipId: ClipId
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
  readonly startTick: Tick
  /** Authored Note Off after Clip-edge clipping. */
  readonly endTick: Tick
  /** Final gated release after channel-local CC64 hold; never precedes endTick. */
  readonly releaseTick: Tick
  readonly pitch: MidiPitch
  readonly velocity: MidiVelocity
  readonly channel: MidiChannel
}

export interface AudibleMidiProjectPlan {
  readonly status: AudibleMidiPlanStatus
  readonly modelRevision: ModelRevision
  /** Furthest authored Clip end, including muted and unsupported content. */
  readonly arrangementEndTick: Tick
  /** Shared derived view and natural-playback end; never precedes arrangementEndTick. */
  readonly timelineEndTick: Tick
  readonly tempoSegments: readonly TempoSegmentPlan[]
  readonly master: MasterChannelPlan
  readonly tracks: readonly TrackPlaybackPlan[]
  /**
   * The note spans of each audible Clip, in span order. Every span belongs to an audible Track of
   * `tracks`, and occurrence keys are unique across the plan. A Clip that did not change between
   * two plans has the same array in both, so consumers can do per-Clip work once.
   */
  readonly clipSpans: ReadonlyMap<ClipId, readonly MidiNoteSpanPlan[]>
  readonly diagnostics: readonly PlaybackDiagnostic[]
}

/** Span order: start, then end, then occurrence key, so it never depends on storage order. */
export function compareNoteSpans(left: MidiNoteSpanPlan, right: MidiNoteSpanPlan): number {
  if (left.startTick !== right.startTick) return left.startTick - right.startTick
  if (left.endTick !== right.endTick) return left.endTick - right.endTick
  if (left.occurrenceKey < right.occurrenceKey) return -1
  if (left.occurrenceKey > right.occurrenceKey) return 1
  return 0
}

/** Encodes an occurrence tuple without delimiter ambiguity or runtime object identity. */
export function createNoteOccurrenceKey(
  trackId: TrackId,
  clipId: ClipId,
  sourceId: MidiSourceId,
  noteId: NoteId,
): NoteOccurrenceKey {
  return JSON.stringify([trackId, clipId, sourceId, noteId]) as NoteOccurrenceKey
}
