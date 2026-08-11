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

import type { SoundbankId } from '#internal/sample-instrument-device'
import type { TempoSegmentPlan } from '#internal/time/tempo-map'

export const AUDIBLE_MIDI_PLAN_STATUS = Object.freeze({
  BLOCKED: 'blocked',
  EMPTY: 'empty',
  PARTIAL: 'partial',
  PLAYABLE: 'playable',
} as const)

export type AudibleMidiPlanStatus =
  (typeof AUDIBLE_MIDI_PLAN_STATUS)[keyof typeof AUDIBLE_MIDI_PLAN_STATUS]

export type NoteOccurrenceKey = Brand<string, 'NoteOccurrenceKey'>

export type PlaybackDiagnosticSeverity = 'blocking' | 'info' | 'warning'

export type PlaybackDiagnosticCode =
  | 'audio-track-unsupported'
  | 'instrument-disabled'
  | 'instrument-engine-unsupported'
  | 'instrument-not-selected'
  | 'instrument-runtime-missing'
  | 'invalid-sample-instrument-state'
  | 'looped-midi-clip-unsupported'
  | 'master-audio-effect-chain-unsupported'
  | 'midi-effect-chain-unsupported'
  | 'no-audible-midi-note-spans'
  | 'track-audio-effect-chain-unsupported'

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
  readonly endTick: Tick
  readonly pitch: MidiPitch
  readonly velocity: MidiVelocity
  readonly channel: MidiChannel
}

export interface AudibleMidiProjectPlan {
  readonly status: AudibleMidiPlanStatus
  readonly modelRevision: ModelRevision
  readonly arrangementEndTick: Tick
  readonly tempoSegments: readonly TempoSegmentPlan[]
  readonly master: MasterChannelPlan
  readonly tracks: readonly TrackPlaybackPlan[]
  readonly midiNoteSpans: readonly MidiNoteSpanPlan[]
  readonly diagnostics: readonly PlaybackDiagnostic[]
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
