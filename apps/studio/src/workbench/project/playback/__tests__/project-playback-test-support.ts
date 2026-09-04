import type {
  ProjectPlaybackInstrumentPreparationFailure,
  ProjectPlaybackPreparedRuntime,
  ProjectPlaybackPreparationOptions,
  ProjectPlaybackRuntimePort,
  ProjectPlaybackTimerPort,
  ProjectPlaybackUnsupportedNoteOccurrence,
  ProjectPlaybackVoiceHandle,
} from '@/workbench/project/playback/project-playback-coordinator'
import type {
  AudibleMidiProjectPlan,
  EngineGeneration,
  PlaybackClockSecond,
  ScheduledSampleVoicePlan,
} from '@seele-daw/playback'

export class ManualProjectPlaybackTimer implements ProjectPlaybackTimerPort {
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

export class ManualProjectPlaybackVoiceHandle implements ProjectPlaybackVoiceHandle {
  readonly cancelCalls: (PlaybackClockSecond | undefined)[] = []
  readonly releaseUpdates: PlaybackClockSecond[] = []
  #active = true
  #releaseRequested = false

  constructor(
    readonly engineGeneration: ScheduledSampleVoicePlan['engineGeneration'],
    readonly occurrenceKey: ScheduledSampleVoicePlan['occurrenceKey'],
    readonly remainsActiveDuringRelease = false,
  ) {}

  cancel(atPlaybackClockSecond?: PlaybackClockSecond): boolean {
    if (!this.#active || this.#releaseRequested) return false
    this.#releaseRequested = true
    if (!this.remainsActiveDuringRelease) this.#active = false
    this.cancelCalls.push(atPlaybackClockSecond)
    return true
  }

  finish(): void {
    this.#active = false
  }

  isActive(): boolean {
    return this.#active
  }

  rescheduleRelease(releasePlaybackClockSecond: PlaybackClockSecond): boolean {
    if (!this.#active || this.#releaseRequested) return false
    this.releaseUpdates.push(releasePlaybackClockSecond)
    return true
  }
}

export class ManualPreparedPlaybackRuntime implements ProjectPlaybackPreparedRuntime {
  readonly generations: EngineGeneration[] = []
  readonly handles: ManualProjectPlaybackVoiceHandle[] = []
  readonly scheduled: ScheduledSampleVoicePlan[] = []
  allNotesOffCount = 0
  allNotesOffFailure: unknown = null
  disposeCount = 0
  currentTime = 0 as PlaybackClockSecond
  readonly preparationFailures: readonly ProjectPlaybackInstrumentPreparationFailure[]
  readonly unsupportedNoteOccurrences: readonly ProjectPlaybackUnsupportedNoteOccurrence[]
  readonly #unavailableSoundbankIds: ReadonlySet<
    ProjectPlaybackInstrumentPreparationFailure['soundbankId']
  >
  readonly #unsupportedOccurrenceKeys: ReadonlySet<
    ProjectPlaybackUnsupportedNoteOccurrence['occurrenceKey']
  >
  readonly #voicesRemainActiveDuringRelease: boolean

  constructor(
    readonly modelRevision: ProjectPlaybackPreparedRuntime['modelRevision'],
    preparationFailures: readonly ProjectPlaybackInstrumentPreparationFailure[] = [],
    voicesRemainActiveDuringRelease = false,
    unsupportedNoteOccurrences: readonly ProjectPlaybackUnsupportedNoteOccurrence[] = [],
  ) {
    this.preparationFailures = Object.freeze([...preparationFailures])
    this.unsupportedNoteOccurrences = Object.freeze([...unsupportedNoteOccurrences])
    this.#unavailableSoundbankIds = new Set(
      preparationFailures.map(({ soundbankId }) => soundbankId),
    )
    this.#unsupportedOccurrenceKeys = new Set(
      unsupportedNoteOccurrences.map(({ occurrenceKey }) => occurrenceKey),
    )
    this.#voicesRemainActiveDuringRelease = voicesRemainActiveDuringRelease
  }

  advanceGeneration(generation: EngineGeneration): void {
    this.generations.push(generation)
  }

  allNotesOff(): void {
    this.allNotesOffCount += 1
    if (this.allNotesOffFailure !== null) throw this.allNotesOffFailure
    for (const handle of this.handles) handle.cancel()
  }

  dispose(): void {
    this.disposeCount += 1
    for (const handle of this.handles) handle.finish()
  }

  now(): PlaybackClockSecond {
    return this.currentTime
  }

  schedule(plan: ScheduledSampleVoicePlan): ProjectPlaybackVoiceHandle | null {
    if (
      this.#unavailableSoundbankIds.has(plan.soundbankId) ||
      this.#unsupportedOccurrenceKeys.has(plan.occurrenceKey)
    ) {
      return null
    }
    this.scheduled.push(plan)
    const handle = new ManualProjectPlaybackVoiceHandle(
      plan.engineGeneration,
      plan.occurrenceKey,
      this.#voicesRemainActiveDuringRelease,
    )
    this.handles.push(handle)
    return handle
  }
}

export class ControlledProjectPlaybackRuntime implements ProjectPlaybackRuntimePort {
  readonly plans: AudibleMidiProjectPlan[] = []
  readonly preparationOptions: ProjectPlaybackPreparationOptions[] = []
  readonly signals: AbortSignal[] = []
  readonly prepared: ManualPreparedPlaybackRuntime[] = []
  currentTime = 0 as PlaybackClockSecond
  disposeCount = 0
  failure: unknown = null
  preparationFailures: readonly ProjectPlaybackInstrumentPreparationFailure[] = []
  unsupportedNotePitches: readonly number[] = []
  voicesRemainActiveDuringRelease = false

  async prepare(
    plan: AudibleMidiProjectPlan,
    signal: AbortSignal,
    options: ProjectPlaybackPreparationOptions,
  ) {
    this.plans.push(plan)
    this.signals.push(signal)
    this.preparationOptions.push(options)
    if (this.failure !== null) throw this.failure
    const unsupportedPitches = new Set(this.unsupportedNotePitches)
    const unsupportedNoteOccurrences: ProjectPlaybackUnsupportedNoteOccurrence[] = []
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
    const runtime = new ManualPreparedPlaybackRuntime(
      plan.modelRevision,
      this.preparationFailures,
      this.voicesRemainActiveDuringRelease,
      unsupportedNoteOccurrences,
    )
    runtime.currentTime = this.currentTime
    this.prepared.push(runtime)
    return runtime
  }

  dispose(): void {
    this.disposeCount += 1
  }
}

interface DeferredPreparationRequest {
  readonly options: ProjectPlaybackPreparationOptions
  readonly plan: AudibleMidiProjectPlan
  readonly reject: (cause: unknown) => void
  readonly resolve: (runtime: ManualPreparedPlaybackRuntime) => void
  readonly signal: AbortSignal
}

export class DeferredProjectPlaybackRuntime implements ProjectPlaybackRuntimePort {
  readonly prepared: ManualPreparedPlaybackRuntime[] = []
  readonly requests: DeferredPreparationRequest[] = []
  disposeCount = 0

  prepare(
    plan: AudibleMidiProjectPlan,
    signal: AbortSignal,
    options: ProjectPlaybackPreparationOptions,
  ): Promise<ProjectPlaybackPreparedRuntime> {
    return new Promise((resolve, reject) => {
      this.requests.push(Object.freeze({ options, plan, reject, resolve, signal }))
    })
  }

  resolve(index: number, currentTime: PlaybackClockSecond): ManualPreparedPlaybackRuntime {
    const request = this.requests[index]
    if (request === undefined) throw new Error(`Missing deferred preparation ${index}`)
    const runtime = new ManualPreparedPlaybackRuntime(request.plan.modelRevision)
    runtime.currentTime = currentTime
    this.prepared.push(runtime)
    request.resolve(runtime)
    return runtime
  }

  reject(index: number, cause: unknown): void {
    const request = this.requests[index]
    if (request === undefined) throw new Error(`Missing deferred preparation ${index}`)
    request.reject(cause)
  }

  dispose(): void {
    this.disposeCount += 1
  }
}
