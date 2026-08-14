import {
  AUDIBLE_MIDI_PLAN_STATUS,
  AUDIBLE_MIDI_SCHEDULER_OUTCOME,
  AUDIBLE_MIDI_TRANSPORT_OUTCOME,
  compileAudibleMidiProject,
  createAudibleMidiSchedulerPlanner,
  createAudibleMidiTransport,
  parsePlaybackClockDurationSecond,
  parsePlaybackClockSecond,
  type AudibleMidiProjectPlan,
  type AudibleMidiSchedulerPlanner,
  type AudibleMidiTransport,
  type AudibleMidiTransportSnapshot,
  type PlaybackDiagnostic,
  type PlaybackClockSecond,
  type ScheduledSampleVoicePlan,
} from '@seele-daw/playback'
import type { ModelRevision, ProjectId, ProjectSession } from '@seele-daw/project-core'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  type ActiveProjectState,
} from '@/workbench/project/active-project-state'
import { ProjectPlaybackError } from '@/workbench/project/playback/project-playback-error'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackFeedback,
  type ProjectPlaybackState,
  type ProjectPlaybackStateDeliveryFailure,
  type ProjectPlaybackStateObserver,
  type ProjectPlaybackUnsubscribe,
} from '@/workbench/project/playback/project-playback-state'

export interface ProjectPlaybackPreparedRuntime {
  readonly modelRevision: ModelRevision
  advanceGeneration(generation: ScheduledSampleVoicePlan['engineGeneration']): void
  allNotesOff(): void
  dispose(): void
  now(): ReturnType<typeof parsePlaybackClockSecond>
  schedule(plan: ScheduledSampleVoicePlan): ProjectPlaybackVoiceHandle | null
}

export interface ProjectPlaybackVoiceHandle {
  readonly engineGeneration: ScheduledSampleVoicePlan['engineGeneration']
  readonly occurrenceKey: ScheduledSampleVoicePlan['occurrenceKey']
  cancel(atPlaybackClockSecond?: PlaybackClockSecond): boolean
  isActive(): boolean
  rescheduleRelease(releasePlaybackClockSecond: PlaybackClockSecond): boolean
}

export interface ProjectPlaybackRuntimePort {
  prepare(
    plan: AudibleMidiProjectPlan,
    signal: AbortSignal,
  ): Promise<ProjectPlaybackPreparedRuntime>
  dispose(): void
}

export interface ProjectPlaybackTimerPort {
  clear(handle: unknown): void
  setRepeating(callback: () => void, intervalMillisecond: number): unknown
}

export interface ProjectPlaybackCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'state' | 'subscribe'>
  readonly runtime: ProjectPlaybackRuntimePort
  readonly timer: ProjectPlaybackTimerPort
}

export interface ProjectPlaybackCoordinator {
  readonly state: ProjectPlaybackState
  pause(): boolean
  play(): Promise<boolean>
  returnToStart(): boolean
  subscribe(observer: ProjectPlaybackStateObserver): ProjectPlaybackUnsubscribe
  togglePlayPause(): boolean
  dispose(): void
}

interface StateSubscriptionEntry {
  active: boolean
  readonly observer: ProjectPlaybackStateObserver
}

interface ActivePlanIdentity {
  readonly modelRevision: ModelRevision
  readonly projectId: ProjectId
  readonly session: ProjectSession
}

const SCHEDULER_WAKE_CADENCE_SECOND = parsePlaybackClockDurationSecond(0.025)
const SCHEDULER_LOOK_AHEAD_HORIZON_SECOND = parsePlaybackClockDurationSecond(0.2)
const SCHEDULER_WAKE_CADENCE_MILLISECOND = SCHEDULER_WAKE_CADENCE_SECOND * 1_000

const UNAVAILABLE_STATE = Object.freeze<ProjectPlaybackState>({
  diagnostics: Object.freeze([]),
  failureCause: null,
  feedback: null,
  modelRevision: null,
  phase: PROJECT_PLAYBACK_PHASE.UNAVAILABLE,
  planStatus: null,
  positionProjectSecond: 0,
  projectId: null,
})

function feedbackForPlan(plan: AudibleMidiProjectPlan): ProjectPlaybackFeedback | null {
  if (plan.status === AUDIBLE_MIDI_PLAN_STATUS.BLOCKED) {
    return Object.freeze({
      kind: 'error',
      message: 'Playback is blocked by unsupported project routing.',
    })
  }
  if (plan.status === AUDIBLE_MIDI_PLAN_STATUS.EMPTY) {
    return Object.freeze({ kind: 'info', message: 'No audible MIDI notes to play.' })
  }
  if (plan.status === AUDIBLE_MIDI_PLAN_STATUS.PARTIAL) {
    return Object.freeze({
      kind: 'warning',
      message: 'Some unsupported project content will be skipped.',
    })
  }
  return null
}

function feedbackForFailure(cause: unknown): ProjectPlaybackFeedback {
  const message =
    cause instanceof Error && cause.message.trim() !== ''
      ? cause.message
      : 'The audio runtime could not start playback.'
  return Object.freeze({ kind: 'error', message })
}

function createState(input: {
  readonly diagnostics: readonly PlaybackDiagnostic[]
  readonly failureCause?: unknown
  readonly feedback?: ProjectPlaybackFeedback | null
  readonly phase: ProjectPlaybackState['phase']
  readonly plan: AudibleMidiProjectPlan
  readonly positionProjectSecond?: number
  readonly projectId: ProjectId
}): ProjectPlaybackState {
  return Object.freeze({
    diagnostics: input.diagnostics,
    failureCause: input.failureCause ?? null,
    feedback: input.feedback === undefined ? feedbackForPlan(input.plan) : input.feedback,
    modelRevision: input.plan.modelRevision,
    phase: input.phase,
    planStatus: input.plan.status,
    positionProjectSecond: input.positionProjectSecond ?? 0,
    projectId: input.projectId,
  })
}

function isPlayablePlan(plan: AudibleMidiProjectPlan): boolean {
  return (
    plan.status === AUDIBLE_MIDI_PLAN_STATUS.PARTIAL ||
    plan.status === AUDIBLE_MIDI_PLAN_STATUS.PLAYABLE
  )
}

/**
 * Owns the Studio use case that joins Project facts, browser-independent playback planning, audio
 * resource preparation, native scheduling, user commands, and project/application cleanup.
 */
class ProjectPlaybackCoordinatorImpl implements ProjectPlaybackCoordinator {
  readonly #runtimePort: ProjectPlaybackRuntimePort
  readonly #timerPort: ProjectPlaybackTimerPort
  readonly #subscriptions = new Set<StateSubscriptionEntry>()
  readonly #unsubscribeActiveProject: ProjectPlaybackUnsubscribe
  #activePlanIdentity: ActivePlanIdentity | null = null
  #plan: AudibleMidiProjectPlan | null = null
  #preparedRuntime: ProjectPlaybackPreparedRuntime | null = null
  #transport: AudibleMidiTransport | null = null
  #scheduler: AudibleMidiSchedulerPlanner | null = null
  #timerHandle: unknown = null
  #preparationAbortController: AbortController | null = null
  #requestSequence = 0
  #state: ProjectPlaybackState = UNAVAILABLE_STATE
  #disposed = false

  constructor(dependencies: ProjectPlaybackCoordinatorDependencies) {
    this.#runtimePort = dependencies.runtime
    this.#timerPort = dependencies.timer
    this.#synchronizeActiveProject(dependencies.activeProject.state)
    this.#unsubscribeActiveProject = dependencies.activeProject.subscribe({
      onStateChange: (state) => this.#synchronizeActiveProject(state),
      onError: (failure) => this.#failCurrentPlan(failure.cause),
    })
  }

  get state(): ProjectPlaybackState {
    return this.#state
  }

  async play(): Promise<boolean> {
    this.#assertLive()
    const plan = this.#requirePlayablePlan()
    if (
      this.#state.phase === PROJECT_PLAYBACK_PHASE.LOADING ||
      this.#state.phase === PROJECT_PLAYBACK_PHASE.PLAYING
    ) {
      return false
    }

    const projectId = this.#requireProjectId()
    const requestSequence = ++this.#requestSequence
    const abortController = new AbortController()
    this.#preparationAbortController?.abort()
    this.#preparationAbortController = abortController
    this.#publish(
      createState({
        diagnostics: plan.diagnostics,
        feedback: Object.freeze({ kind: 'info', message: 'Loading instrument…' }),
        phase: PROJECT_PLAYBACK_PHASE.LOADING,
        plan,
        positionProjectSecond: this.#state.positionProjectSecond,
        projectId,
      }),
    )

    try {
      this.#preparedRuntime?.dispose()
      this.#preparedRuntime = null
      const preparedRuntime = await this.#runtimePort.prepare(plan, abortController.signal)
      if (!this.#isCurrentRequest(requestSequence, plan, abortController)) {
        preparedRuntime.dispose()
        return false
      }

      this.#preparedRuntime = preparedRuntime
      if (this.#transport === null || this.#scheduler === null) {
        this.#transport = createAudibleMidiTransport(plan, {
          now: () => {
            const currentRuntime = this.#preparedRuntime
            if (currentRuntime === null) {
              throw new ProjectPlaybackError(
                'playback-unavailable',
                'Project Playback has no active audio clock',
              )
            }
            return currentRuntime.now()
          },
        })
        this.#scheduler = createAudibleMidiSchedulerPlanner(plan, {
          lookAheadHorizonSecond: SCHEDULER_LOOK_AHEAD_HORIZON_SECOND,
          wakeCadenceSecond: SCHEDULER_WAKE_CADENCE_SECOND,
        })
      }

      const transition = this.#transport.play()
      if (transition.outcome !== AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAYED) {
        throw new ProjectPlaybackError(
          'playback-unavailable',
          `Transport rejected Play with outcome ${transition.outcome}`,
        )
      }
      preparedRuntime.advanceGeneration(transition.snapshot.engineGeneration)
      this.#scheduleNextWindow(transition.snapshot)
      this.#startTimer()
      this.#publishTransportState(transition.snapshot)
      return true
    } catch (cause) {
      if (!this.#isCurrentRequest(requestSequence, plan, abortController)) return false
      this.#failCurrentPlan(cause)
      return false
    } finally {
      if (this.#preparationAbortController === abortController) {
        this.#preparationAbortController = null
      }
    }
  }

  pause(): boolean {
    this.#assertLive()
    const transport = this.#transport
    if (transport === null) return false
    const transition = transport.pause()
    if (transition.outcome !== AUDIBLE_MIDI_TRANSPORT_OUTCOME.PAUSED) return false

    this.#stopTimer()
    this.#preparedRuntime?.advanceGeneration(transition.snapshot.engineGeneration)
    this.#preparedRuntime?.allNotesOff()
    this.#publishTransportState(transition.snapshot)
    return true
  }

  returnToStart(): boolean {
    this.#assertLive()
    return this.#returnToStart()
  }

  #returnToStart(): boolean {
    const wasLoading = this.#state.phase === PROJECT_PLAYBACK_PHASE.LOADING
    this.#cancelPreparation()
    this.#stopTimer()
    const transport = this.#transport
    if (transport === null) {
      this.#preparedRuntime?.allNotesOff()
      this.#publishStoppedAtStart()
      return wasLoading
    }

    const transition = transport.returnToStart()
    if (transition.outcome === AUDIBLE_MIDI_TRANSPORT_OUTCOME.RETURNED_TO_START) {
      this.#preparedRuntime?.advanceGeneration(transition.snapshot.engineGeneration)
      this.#preparedRuntime?.allNotesOff()
    } else {
      this.#preparedRuntime?.allNotesOff()
    }
    this.#publishTransportState(transition.snapshot)
    return wasLoading || transition.outcome === AUDIBLE_MIDI_TRANSPORT_OUTCOME.RETURNED_TO_START
  }

  togglePlayPause(): boolean {
    this.#assertLive()
    if (this.#state.phase === PROJECT_PLAYBACK_PHASE.PLAYING) return this.pause()
    if (this.#state.phase === PROJECT_PLAYBACK_PHASE.LOADING) return false
    if (this.#plan === null || !isPlayablePlan(this.#plan)) return false
    void this.play()
    return true
  }

  subscribe(observer: ProjectPlaybackStateObserver): ProjectPlaybackUnsubscribe {
    this.#assertLive()
    const entry: StateSubscriptionEntry = { active: true, observer }
    this.#subscriptions.add(entry)
    return () => {
      if (!entry.active) return
      entry.active = false
      this.#subscriptions.delete(entry)
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#unsubscribeActiveProject()
    this.#releasePlanRuntime()
    this.#runtimePort.dispose()
    this.#activePlanIdentity = null
    this.#plan = null
    this.#state = UNAVAILABLE_STATE
    for (const entry of this.#subscriptions) entry.active = false
    this.#subscriptions.clear()
  }

  #assertLive(): void {
    if (this.#disposed) {
      throw new ProjectPlaybackError('coordinator-disposed', 'Project Playback is disposed')
    }
  }

  #cancelPreparation(): void {
    this.#requestSequence += 1
    this.#preparationAbortController?.abort()
    this.#preparationAbortController = null
  }

  #failCurrentPlan(cause: unknown): void {
    if (this.#disposed) return
    const plan = this.#plan
    const projectId = this.#activePlanIdentity?.projectId
    this.#releasePlanRuntime()
    if (plan === null || projectId === undefined) {
      this.#publish(UNAVAILABLE_STATE)
      return
    }
    this.#publish(
      createState({
        diagnostics: plan.diagnostics,
        failureCause: cause,
        feedback: feedbackForFailure(cause),
        phase: PROJECT_PLAYBACK_PHASE.FAILED,
        plan,
        projectId,
      }),
    )
  }

  #isCurrentRequest(
    requestSequence: number,
    plan: AudibleMidiProjectPlan,
    abortController: AbortController,
  ): boolean {
    return (
      !this.#disposed &&
      !abortController.signal.aborted &&
      requestSequence === this.#requestSequence &&
      this.#plan === plan
    )
  }

  #publish(state: ProjectPlaybackState): void {
    this.#state = state
    for (const entry of this.#subscriptions) {
      if (!entry.active) continue
      try {
        entry.observer.onStateChange(state)
      } catch (cause) {
        entry.active = false
        this.#subscriptions.delete(entry)
        const failure = Object.freeze<ProjectPlaybackStateDeliveryFailure>({ cause, state })
        try {
          entry.observer.onError(failure)
        } catch {
          // The failed observer is detached, so error reporting cannot recurse.
        }
      }
    }
  }

  #publishStoppedAtStart(): void {
    const plan = this.#plan
    const projectId = this.#activePlanIdentity?.projectId
    if (plan === null || projectId === undefined) return
    this.#publish(
      createState({
        diagnostics: plan.diagnostics,
        phase: PROJECT_PLAYBACK_PHASE.STOPPED,
        plan,
        projectId,
      }),
    )
  }

  #publishTransportState(snapshot: AudibleMidiTransportSnapshot): void {
    const plan = this.#plan
    const projectId = this.#activePlanIdentity?.projectId
    if (plan === null || projectId === undefined) return
    let phase: ProjectPlaybackState['phase']
    switch (snapshot.state) {
      case 'paused':
        phase = PROJECT_PLAYBACK_PHASE.PAUSED
        break
      case 'playing':
        phase = PROJECT_PLAYBACK_PHASE.PLAYING
        break
      case 'stopped':
        phase = PROJECT_PLAYBACK_PHASE.STOPPED
        break
    }
    this.#publish(
      createState({
        diagnostics: plan.diagnostics,
        phase,
        plan,
        positionProjectSecond: snapshot.positionProjectSecond,
        projectId,
      }),
    )
  }

  #releasePlanRuntime(): void {
    this.#cancelPreparation()
    this.#stopTimer()
    try {
      this.#preparedRuntime?.allNotesOff()
    } catch {
      // Disposal below remains authoritative after a context interruption.
    }
    this.#preparedRuntime?.dispose()
    this.#preparedRuntime = null
    this.#transport = null
    this.#scheduler = null
  }

  #requirePlayablePlan(): AudibleMidiProjectPlan {
    const plan = this.#plan
    if (plan === null || !isPlayablePlan(plan)) {
      throw new ProjectPlaybackError(
        'playback-unavailable',
        'The Active Project has no playable Audible MIDI Plan',
      )
    }
    return plan
  }

  #requireProjectId(): ProjectId {
    const projectId = this.#activePlanIdentity?.projectId
    if (projectId === undefined) {
      throw new ProjectPlaybackError(
        'active-project-not-ready',
        'Project Playback requires a ready Active Project',
      )
    }
    return projectId
  }

  #scheduleNextWindow(snapshot: AudibleMidiTransportSnapshot): void {
    const scheduler = this.#scheduler
    const preparedRuntime = this.#preparedRuntime
    if (scheduler === null || preparedRuntime === null) {
      throw new ProjectPlaybackError(
        'playback-unavailable',
        'Project Playback scheduling resources are unavailable',
      )
    }
    const batch = scheduler.planNextWindow(snapshot)
    if (batch.outcome !== AUDIBLE_MIDI_SCHEDULER_OUTCOME.PLANNED) return
    for (const voicePlan of batch.voicePlans) preparedRuntime.schedule(voicePlan)
  }

  #startTimer(): void {
    if (this.#timerHandle !== null) return
    this.#timerHandle = this.#timerPort.setRepeating(
      () => this.#tick(),
      SCHEDULER_WAKE_CADENCE_MILLISECOND,
    )
  }

  #stopTimer(): void {
    if (this.#timerHandle === null) return
    this.#timerPort.clear(this.#timerHandle)
    this.#timerHandle = null
  }

  #synchronizeActiveProject(state: ActiveProjectState): void {
    if (this.#disposed) return
    if (state.phase !== ACTIVE_PROJECT_PHASE.READY) {
      this.#releasePlanRuntime()
      this.#activePlanIdentity = null
      this.#plan = null
      this.#publish(UNAVAILABLE_STATE)
      return
    }

    const current = this.#activePlanIdentity
    if (
      current?.projectId === state.projectId &&
      current.session === state.session &&
      current.modelRevision === state.modelRevision
    ) {
      return
    }

    this.#releasePlanRuntime()
    this.#activePlanIdentity = Object.freeze({
      modelRevision: state.modelRevision,
      projectId: state.projectId,
      session: state.session,
    })
    try {
      const plan = compileAudibleMidiProject(state.session.getSnapshot())
      this.#plan = plan
      this.#publish(
        createState({
          diagnostics: plan.diagnostics,
          phase: PROJECT_PLAYBACK_PHASE.STOPPED,
          plan,
          projectId: state.projectId,
        }),
      )
    } catch (cause) {
      this.#plan = null
      this.#publish(
        Object.freeze({
          diagnostics: Object.freeze([]),
          failureCause: cause,
          feedback: feedbackForFailure(cause),
          modelRevision: state.modelRevision,
          phase: PROJECT_PLAYBACK_PHASE.FAILED,
          planStatus: null,
          positionProjectSecond: 0,
          projectId: state.projectId,
        }),
      )
    }
  }

  #tick(): void {
    if (this.#disposed) return
    const transport = this.#transport
    if (transport === null) return
    try {
      const snapshot = transport.getSnapshot()
      if (snapshot.state !== 'playing') {
        this.#stopTimer()
        this.#publishTransportState(snapshot)
        return
      }
      this.#scheduleNextWindow(snapshot)
      this.#publishTransportState(snapshot)
    } catch (cause) {
      this.#failCurrentPlan(cause)
    }
  }
}

/** Creates the single framework-neutral playback coordinator for the Studio application graph. */
export function createProjectPlaybackCoordinator(
  dependencies: ProjectPlaybackCoordinatorDependencies,
): ProjectPlaybackCoordinator {
  return new ProjectPlaybackCoordinatorImpl(dependencies)
}
