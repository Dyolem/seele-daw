import type {
  ProjectPlaybackInstrumentPreparationFailure,
  ProjectPlaybackPreparedRuntime,
  ProjectPlaybackPreparationOptions,
  ProjectPlaybackRuntimePort,
  ProjectPlaybackTimerPort,
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

  constructor(
    readonly engineGeneration: ScheduledSampleVoicePlan['engineGeneration'],
    readonly occurrenceKey: ScheduledSampleVoicePlan['occurrenceKey'],
  ) {}

  cancel(atPlaybackClockSecond?: PlaybackClockSecond): boolean {
    if (!this.#active) return false
    this.#active = false
    this.cancelCalls.push(atPlaybackClockSecond)
    return true
  }

  isActive(): boolean {
    return this.#active
  }

  rescheduleRelease(releasePlaybackClockSecond: PlaybackClockSecond): boolean {
    if (!this.#active) return false
    this.releaseUpdates.push(releasePlaybackClockSecond)
    return true
  }
}

export class ManualPreparedPlaybackRuntime implements ProjectPlaybackPreparedRuntime {
  readonly generations: EngineGeneration[] = []
  readonly handles: ManualProjectPlaybackVoiceHandle[] = []
  readonly scheduled: ScheduledSampleVoicePlan[] = []
  allNotesOffCount = 0
  disposeCount = 0
  currentTime = 0 as PlaybackClockSecond
  readonly preparationFailures: readonly ProjectPlaybackInstrumentPreparationFailure[]
  readonly #unavailableSoundbankIds: ReadonlySet<
    ProjectPlaybackInstrumentPreparationFailure['soundbankId']
  >

  constructor(
    readonly modelRevision: ProjectPlaybackPreparedRuntime['modelRevision'],
    preparationFailures: readonly ProjectPlaybackInstrumentPreparationFailure[] = [],
  ) {
    this.preparationFailures = Object.freeze([...preparationFailures])
    this.#unavailableSoundbankIds = new Set(
      preparationFailures.map(({ soundbankId }) => soundbankId),
    )
  }

  advanceGeneration(generation: EngineGeneration): void {
    this.generations.push(generation)
  }

  allNotesOff(): void {
    this.allNotesOffCount += 1
    for (const handle of this.handles) handle.cancel()
  }

  dispose(): void {
    this.disposeCount += 1
    for (const handle of this.handles) handle.cancel()
  }

  now(): PlaybackClockSecond {
    return this.currentTime
  }

  schedule(plan: ScheduledSampleVoicePlan): ProjectPlaybackVoiceHandle | null {
    if (this.#unavailableSoundbankIds.has(plan.soundbankId)) return null
    this.scheduled.push(plan)
    const handle = new ManualProjectPlaybackVoiceHandle(plan.engineGeneration, plan.occurrenceKey)
    this.handles.push(handle)
    return handle
  }
}

export class ControlledProjectPlaybackRuntime implements ProjectPlaybackRuntimePort {
  readonly plans: AudibleMidiProjectPlan[] = []
  readonly preparationOptions: ProjectPlaybackPreparationOptions[] = []
  readonly signals: AbortSignal[] = []
  readonly prepared: ManualPreparedPlaybackRuntime[] = []
  disposeCount = 0
  failure: unknown = null
  preparationFailures: readonly ProjectPlaybackInstrumentPreparationFailure[] = []

  async prepare(
    plan: AudibleMidiProjectPlan,
    signal: AbortSignal,
    options: ProjectPlaybackPreparationOptions,
  ) {
    this.plans.push(plan)
    this.signals.push(signal)
    this.preparationOptions.push(options)
    if (this.failure !== null) throw this.failure
    const runtime = new ManualPreparedPlaybackRuntime(plan.modelRevision, this.preparationFailures)
    this.prepared.push(runtime)
    return runtime
  }

  dispose(): void {
    this.disposeCount += 1
  }
}
