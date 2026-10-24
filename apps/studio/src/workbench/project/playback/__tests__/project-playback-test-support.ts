import {
  type AudibleMidiProjectPlan,
  type InstrumentPreparationFailure,
  type PlaybackClockSecond,
  type PlaybackPreparationOptions,
  type PlaybackRuntimePort,
  type PlaybackTimerPort,
  type PlaybackVoice,
  type PreparedPlaybackPlan,
  type ScheduledSampleVoicePlan,
  type UnsupportedNoteOccurrence,
} from '@seele-daw/playback'

export class ManualProjectPlaybackTimer implements PlaybackTimerPort {
  readonly callbacks = new Map<object, () => void>()
  readonly intervals: number[] = []

  clear(handle: unknown): void {
    this.callbacks.delete(handle as object)
  }

  setRepeating(callback: () => void, intervalMillisecond: number): object {
    const handle = Object.freeze({ sequence: this.intervals.length })
    this.intervals.push(intervalMillisecond)
    this.callbacks.set(handle, callback)
    return handle
  }

  fire(): void {
    for (const callback of this.callbacks.values()) callback()
  }
}

export class ManualProjectPlaybackVoice implements PlaybackVoice {
  readonly cancelCalls: (PlaybackClockSecond | undefined)[] = []
  readonly releaseUpdates: PlaybackClockSecond[] = []
  #active = true
  #releaseRequested = false

  constructor(
    readonly plan: ScheduledSampleVoicePlan,
    readonly remainsActiveDuringRelease = false,
  ) {}

  get occurrenceKey(): ScheduledSampleVoicePlan['occurrenceKey'] {
    return this.plan.occurrenceKey
  }

  cancel(atPlaybackClockSecond?: PlaybackClockSecond): void {
    if (!this.#active || this.#releaseRequested) return
    this.#releaseRequested = true
    if (!this.remainsActiveDuringRelease) this.#active = false
    this.cancelCalls.push(atPlaybackClockSecond)
  }

  finish(): void {
    this.#active = false
  }

  isActive(): boolean {
    return this.#active
  }

  rescheduleRelease(releasePlaybackClockSecond: PlaybackClockSecond): void {
    if (!this.#active || this.#releaseRequested) return
    this.releaseUpdates.push(releasePlaybackClockSecond)
  }
}

/** The output both fake runtimes share: one clock, and every voice any prepared plan started. */
abstract class ManualPlaybackOutput implements PlaybackRuntimePort {
  readonly prepared: ManualPreparedPlaybackPlan[] = []
  readonly voices: ManualProjectPlaybackVoice[] = []
  allNotesOffCount = 0
  allNotesOffFailure: unknown = null
  currentTime = 0 as PlaybackClockSecond
  disposeCount = 0
  voicesRemainActiveDuringRelease = false

  abstract prepare(
    plan: AudibleMidiProjectPlan,
    signal: AbortSignal,
    options: PlaybackPreparationOptions,
  ): Promise<PreparedPlaybackPlan>

  now(): PlaybackClockSecond {
    return this.currentTime
  }

  allNotesOff(): void {
    this.allNotesOffCount += 1
    if (this.allNotesOffFailure !== null) throw this.allNotesOffFailure
    for (const voice of this.voices) voice.cancel()
  }

  dispose(): void {
    this.disposeCount += 1
    for (const voice of this.voices) voice.finish()
  }
}

export class ManualPreparedPlaybackPlan implements PreparedPlaybackPlan {
  readonly scheduled: ScheduledSampleVoicePlan[] = []
  readonly voices: ManualProjectPlaybackVoice[] = []
  readonly preparationFailures: readonly InstrumentPreparationFailure[]
  readonly unsupportedNoteOccurrences: readonly UnsupportedNoteOccurrence[]
  readonly #output: ManualPlaybackOutput
  readonly #unavailableSoundbankIds: ReadonlySet<InstrumentPreparationFailure['soundbankId']>
  readonly #unsupportedOccurrenceKeys: ReadonlySet<UnsupportedNoteOccurrence['occurrenceKey']>

  constructor(
    output: ManualPlaybackOutput,
    readonly modelRevision: PreparedPlaybackPlan['modelRevision'],
    preparationFailures: readonly InstrumentPreparationFailure[] = [],
    unsupportedNoteOccurrences: readonly UnsupportedNoteOccurrence[] = [],
  ) {
    this.#output = output
    this.preparationFailures = Object.freeze([...preparationFailures])
    this.unsupportedNoteOccurrences = Object.freeze([...unsupportedNoteOccurrences])
    this.#unavailableSoundbankIds = new Set(
      preparationFailures.map(({ soundbankId }) => soundbankId),
    )
    this.#unsupportedOccurrenceKeys = new Set(
      unsupportedNoteOccurrences.map(({ occurrenceKey }) => occurrenceKey),
    )
  }

  schedule(plan: ScheduledSampleVoicePlan): PlaybackVoice | null {
    if (
      this.#unavailableSoundbankIds.has(plan.soundbankId) ||
      this.#unsupportedOccurrenceKeys.has(plan.occurrenceKey)
    ) {
      return null
    }
    this.scheduled.push(plan)
    const voice = new ManualProjectPlaybackVoice(plan, this.#output.voicesRemainActiveDuringRelease)
    this.voices.push(voice)
    this.#output.voices.push(voice)
    return voice
  }
}

export class ControlledProjectPlaybackRuntime extends ManualPlaybackOutput {
  readonly plans: AudibleMidiProjectPlan[] = []
  readonly preparationOptions: PlaybackPreparationOptions[] = []
  readonly signals: AbortSignal[] = []
  failure: unknown = null
  preparationFailures: readonly InstrumentPreparationFailure[] = []
  unsupportedNotePitches: readonly number[] = []

  async prepare(
    plan: AudibleMidiProjectPlan,
    signal: AbortSignal,
    options: PlaybackPreparationOptions,
  ): Promise<ManualPreparedPlaybackPlan> {
    this.plans.push(plan)
    this.signals.push(signal)
    this.preparationOptions.push(options)
    if (this.failure !== null) throw this.failure
    const unsupportedPitches = new Set(this.unsupportedNotePitches)
    const unsupportedNoteOccurrences: UnsupportedNoteOccurrence[] = []
    for (const span of plan.midiNoteSpans) {
      if (!unsupportedPitches.has(span.pitch)) continue
      const route = plan.tracks.find(({ trackId }) => trackId === span.trackId)
      if (route === undefined) throw new Error(`Missing Track route ${span.trackId}`)
      unsupportedNoteOccurrences.push(
        Object.freeze({
          occurrenceKey: span.occurrenceKey,
          pitch: span.pitch,
          reason: 'no-matching-zone',
          soundbankId: route.instrument.soundbankId,
          trackId: span.trackId,
        }),
      )
    }
    const prepared = new ManualPreparedPlaybackPlan(
      this,
      plan.modelRevision,
      this.preparationFailures,
      unsupportedNoteOccurrences,
    )
    this.prepared.push(prepared)
    return prepared
  }
}

interface DeferredPreparationRequest {
  readonly options: PlaybackPreparationOptions
  readonly plan: AudibleMidiProjectPlan
  readonly reject: (cause: unknown) => void
  readonly resolve: (prepared: ManualPreparedPlaybackPlan) => void
  readonly signal: AbortSignal
}

export class DeferredProjectPlaybackRuntime extends ManualPlaybackOutput {
  readonly requests: DeferredPreparationRequest[] = []

  prepare(
    plan: AudibleMidiProjectPlan,
    signal: AbortSignal,
    options: PlaybackPreparationOptions,
  ): Promise<ManualPreparedPlaybackPlan> {
    return new Promise((resolve, reject) => {
      this.requests.push(Object.freeze({ options, plan, reject, resolve, signal }))
    })
  }

  resolve(index: number, currentTime: PlaybackClockSecond): ManualPreparedPlaybackPlan {
    const request = this.requests[index]
    if (request === undefined) throw new Error(`Missing deferred preparation ${index}`)
    this.currentTime = currentTime
    const prepared = new ManualPreparedPlaybackPlan(this, request.plan.modelRevision)
    this.prepared.push(prepared)
    request.resolve(prepared)
    return prepared
  }

  reject(index: number, cause: unknown): void {
    const request = this.requests[index]
    if (request === undefined) throw new Error(`Missing deferred preparation ${index}`)
    request.reject(cause)
  }
}
