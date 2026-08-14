import type {
  ProjectPlaybackPreparedRuntime,
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

export class ManualPreparedPlaybackRuntime implements ProjectPlaybackPreparedRuntime {
  readonly generations: EngineGeneration[] = []
  readonly handles: ProjectPlaybackVoiceHandle[] = []
  readonly scheduled: ScheduledSampleVoicePlan[] = []
  allNotesOffCount = 0
  disposeCount = 0
  currentTime = 0 as PlaybackClockSecond

  constructor(readonly modelRevision: ProjectPlaybackPreparedRuntime['modelRevision']) {}

  advanceGeneration(generation: EngineGeneration): void {
    this.generations.push(generation)
  }

  allNotesOff(): void {
    this.allNotesOffCount += 1
    for (const handle of this.handles) handle.cancel()
  }

  dispose(): void {
    this.disposeCount += 1
  }

  now(): PlaybackClockSecond {
    return this.currentTime
  }

  schedule(plan: ScheduledSampleVoicePlan): ProjectPlaybackVoiceHandle {
    this.scheduled.push(plan)
    let active = true
    const handle = Object.freeze({
      cancel: () => {
        if (!active) return false
        active = false
        return true
      },
      engineGeneration: plan.engineGeneration,
      isActive: () => active,
      occurrenceKey: plan.occurrenceKey,
      rescheduleRelease: () => active,
    })
    this.handles.push(handle)
    return handle
  }
}

export class ControlledProjectPlaybackRuntime implements ProjectPlaybackRuntimePort {
  readonly plans: AudibleMidiProjectPlan[] = []
  readonly signals: AbortSignal[] = []
  readonly prepared: ManualPreparedPlaybackRuntime[] = []
  disposeCount = 0
  failure: unknown = null

  async prepare(plan: AudibleMidiProjectPlan, signal: AbortSignal) {
    this.plans.push(plan)
    this.signals.push(signal)
    if (this.failure !== null) throw this.failure
    const runtime = new ManualPreparedPlaybackRuntime(plan.modelRevision)
    this.prepared.push(runtime)
    return runtime
  }

  dispose(): void {
    this.disposeCount += 1
  }
}
