import {
  parsePlaybackClockSecond,
  type AudibleMidiProjectPlan,
  type InstrumentPreparationFailure,
  type PlaybackClockSecond,
  type PlaybackRuntimePort,
  type PlaybackTimerPort,
  type PlaybackVoice,
  type PreparedPlaybackPlan,
  type UnsupportedNoteOccurrence,
} from '@seele-daw/playback'

export class ManualProjectPlaybackTimer implements PlaybackTimerPort {
  readonly callbacks = new Map<object, () => void>()

  clear(handle: unknown): void {
    this.callbacks.delete(handle as object)
  }

  setRepeating(callback: () => void): object {
    const handle = Object.freeze({})
    this.callbacks.set(handle, callback)
    return handle
  }
}

const SOUNDING_VOICE = Object.freeze<PlaybackVoice>({
  cancel() {},
  isActive: () => true,
  rescheduleRelease() {},
})

/** An output whose voices sound until it is disposed; the engine's own tests live in playback. */
export class FakeProjectPlaybackRuntime implements PlaybackRuntimePort {
  readonly plans: AudibleMidiProjectPlan[] = []
  allNotesOffCount = 0
  currentTime: PlaybackClockSecond = parsePlaybackClockSecond(0)
  disposeCount = 0
  failure: unknown = null
  preparationFailures: readonly InstrumentPreparationFailure[] = []
  unsupportedNotePitches: readonly number[] = []

  async prepare(plan: AudibleMidiProjectPlan): Promise<PreparedPlaybackPlan> {
    this.plans.push(plan)
    if (this.failure !== null) throw this.failure
    const unsupportedPitches = new Set(this.unsupportedNotePitches)
    const soundbankByTrack = new Map(
      plan.tracks.map(({ instrument, trackId }) => [trackId, instrument.soundbankId]),
    )
    const unsupportedNoteOccurrences = plan.midiNoteSpans
      .filter(({ pitch }) => unsupportedPitches.has(pitch))
      .map((span) =>
        Object.freeze<UnsupportedNoteOccurrence>({
          occurrenceKey: span.occurrenceKey,
          pitch: span.pitch,
          reason: 'no-matching-zone',
          soundbankId: soundbankByTrack.get(span.trackId)!,
          trackId: span.trackId,
        }),
      )
    return Object.freeze({
      modelRevision: plan.modelRevision,
      preparationFailures: this.preparationFailures,
      unsupportedNoteOccurrences,
      schedule: () => SOUNDING_VOICE,
    })
  }

  now(): PlaybackClockSecond {
    return this.currentTime
  }

  allNotesOff(): void {
    this.allNotesOffCount += 1
  }

  dispose(): void {
    this.disposeCount += 1
  }
}
