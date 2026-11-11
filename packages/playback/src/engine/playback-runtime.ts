import type { ModelRevision } from '@seele-daw/project-core'

import type { AudibleMidiProjectPlan } from '#internal/compiler/audible-midi-plan'
import type { SoundbankId } from '#internal/device/sample-instrument-device'
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

/** One voice the output is playing. */
export interface PlaybackVoice {
  /** Fades the voice out quickly, from the given time or now. */
  cancel(atPlaybackClockSecond?: PlaybackClockSecond): void
  /** True until the voice has fallen silent. */
  isActive(): boolean
  /** Moves the release of a voice whose release has not started; otherwise does nothing. */
  rescheduleRelease(releasePlaybackClockSecond: PlaybackClockSecond): void
}

/** The instruments loaded for one plan revision, and what of the plan they cannot play. */
export interface PreparedPlaybackPlan {
  readonly modelRevision: ModelRevision
  readonly preparationFailures: readonly InstrumentPreparationFailure[]
  readonly unsupportedNoteOccurrences: readonly UnsupportedNoteOccurrence[]
  /** Starts one voice of the plan on the output; null when it cannot sound. */
  schedule(voice: ScheduledSampleVoicePlan): PlaybackVoice | null
}

/**
 * The audio side of playback: one output with its clock and every voice it plays. Voices of an
 * older revision keep sounding until they end, so polyphony and all-notes-off cover all of them.
 */
export interface PlaybackRuntimePort {
  /** Loads the instruments a plan needs; the first call also starts the output. */
  prepare(
    plan: AudibleMidiProjectPlan,
    signal: PlaybackAbortSignal,
    options: PlaybackPreparationOptions,
  ): Promise<PreparedPlaybackPlan>
  /** The output clock; only read once a preparation has started the output. */
  now(): PlaybackClockSecond
  /** Fades out every voice. */
  allNotesOff(): void
  dispose(): void
}

export interface PlaybackTimerPort {
  clear(handle: unknown): void
  setRepeating(callback: () => void, intervalMillisecond: number): unknown
}
