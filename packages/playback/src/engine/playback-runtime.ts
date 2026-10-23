import type { ModelRevision } from '@seele-daw/project-core'

import type { AudibleMidiProjectPlan } from '#internal/compiler/audible-midi-plan'
import type { SoundbankId } from '#internal/sample-instrument-device'
import type { ScheduledSampleVoicePlan } from '#internal/scheduler/audible-midi-scheduler'
import type { PlaybackClockSecond } from '#internal/time/project-time'

/** What preparation needs of an AbortSignal; a DOM AbortSignal is one. */
export interface PlaybackAbortSignal {
  readonly aborted: boolean
  addEventListener(type: 'abort', listener: () => void): void
  removeEventListener(type: 'abort', listener: () => void): void
}

export const PLAYBACK_INSTRUMENT_FAILURE_MODE = Object.freeze({
  /** Starting playback needs every instrument. */
  FAIL_PLAN: 'fail-plan',
  /** An edit during playback keeps going without the instruments that failed to load. */
  SKIP_UNAVAILABLE_INSTRUMENTS: 'skip-unavailable-instruments',
} as const)

export type PlaybackInstrumentFailureMode =
  (typeof PLAYBACK_INSTRUMENT_FAILURE_MODE)[keyof typeof PLAYBACK_INSTRUMENT_FAILURE_MODE]

export interface PlaybackPreparationOptions {
  readonly instrumentFailureMode: PlaybackInstrumentFailureMode
}

export interface InstrumentPreparationFailure {
  readonly cause: unknown
  readonly soundbankId: SoundbankId
}

export interface UnsupportedNoteOccurrence {
  readonly occurrenceKey: ScheduledSampleVoicePlan['occurrenceKey']
  readonly pitch: ScheduledSampleVoicePlan['pitch']
  readonly reason: 'no-matching-zone'
  readonly soundbankId: SoundbankId
  readonly trackId: ScheduledSampleVoicePlan['trackId']
}

/** One scheduled sample voice in the audio runtime. */
export interface PlaybackVoiceHandle {
  readonly engineGeneration: ScheduledSampleVoicePlan['engineGeneration']
  readonly occurrenceKey: ScheduledSampleVoicePlan['occurrenceKey']
  cancel(atPlaybackClockSecond?: PlaybackClockSecond): boolean
  isActive(): boolean
  rescheduleRelease(releasePlaybackClockSecond: PlaybackClockSecond): boolean
}

/** Audio resources loaded for one plan revision, with its own clock. */
export interface PreparedPlaybackRuntime {
  readonly modelRevision: ModelRevision
  readonly preparationFailures: readonly InstrumentPreparationFailure[]
  readonly unsupportedNoteOccurrences: readonly UnsupportedNoteOccurrence[]
  advanceGeneration(generation: ScheduledSampleVoicePlan['engineGeneration']): void
  allNotesOff(): void
  dispose(): void
  now(): PlaybackClockSecond
  schedule(plan: ScheduledSampleVoicePlan): PlaybackVoiceHandle | null
}

/** The audio side of playback: loads a plan's instruments and plays its voices. */
export interface PlaybackRuntimePort {
  prepare(
    plan: AudibleMidiProjectPlan,
    signal: PlaybackAbortSignal,
    options: PlaybackPreparationOptions,
  ): Promise<PreparedPlaybackRuntime>
  dispose(): void
}

export interface PlaybackTimerPort {
  clear(handle: unknown): void
  setRepeating(callback: () => void, intervalMillisecond: number): unknown
}
