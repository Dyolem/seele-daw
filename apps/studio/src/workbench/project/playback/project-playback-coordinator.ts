import {
  AUDIBLE_MIDI_PLAN_STATUS,
  AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND,
  AUDIBLE_MIDI_RECONCILIATION_SCOPE,
  AUDIBLE_MIDI_SCHEDULER_OUTCOME,
  AUDIBLE_MIDI_TRANSPORT_OUTCOME,
  compileAudibleMidiProject,
  createAudibleMidiReconciliationPlan,
  createAudibleMidiSchedulerPlanner,
  createAudibleMidiTransport,
  parsePlaybackClockDurationSecond,
  parsePlaybackClockSecond,
  type AudibleMidiProjectPlan,
  type AudibleMidiReconciliationPlan,
  type AudibleMidiSchedulerPlanner,
  type AudibleMidiTransport,
  type AudibleMidiTransportSnapshot,
  type PlaybackDiagnostic,
  type PlaybackClockSecond,
  type ScheduledSampleVoicePlan,
} from '@seele-daw/playback'
import {
  PROJECT_COMMAND_TYPE,
  type ModelRevision,
  type ProjectCommit,
  type ProjectId,
  type ProjectSession,
} from '@seele-daw/project-core'

import type {
  ActiveProjectCommitEvent,
  ActiveProjectService,
} from '@/workbench/project/active-project-service'
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
  readonly activeProject: Pick<ActiveProjectService, 'state' | 'subscribe' | 'subscribeCommits'>
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

interface ScheduledVoiceEntry {
  readonly handle: ProjectPlaybackVoiceHandle
  readonly plan: ScheduledSampleVoicePlan
  readonly runtime: ProjectPlaybackPreparedRuntime
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

function isMidiNoteReconciliationCommit(commit: ProjectCommit): boolean {
  switch (commit.origin.commandType) {
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD:
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE:
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE:
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE:
      return true
    case PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE:
    case PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD:
    case PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD:
      return false
  }
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
  readonly #unsubscribeActiveProjectCommits: ProjectPlaybackUnsubscribe
  readonly #retiredRuntimes = new Set<ProjectPlaybackPreparedRuntime>()
  readonly #scheduledVoices = new Set<ScheduledVoiceEntry>()
  #activePlanIdentity: ActivePlanIdentity | null = null
  #plan: AudibleMidiProjectPlan | null = null
  #preparedRuntime: ProjectPlaybackPreparedRuntime | null = null
  #transport: AudibleMidiTransport | null = null
  #scheduler: AudibleMidiSchedulerPlanner | null = null
  #timerHandle: unknown = null
  #preparationAbortController: AbortController | null = null
  #requestSequence = 0
  #pendingCommits: ProjectCommit[] = []
  #pendingCommitEvent: ActiveProjectCommitEvent | null = null
  #pendingCommitFlushQueued = false
  #pendingCommitChainBroken = false
  #pendingPlan: AudibleMidiProjectPlan | null = null
  #suppressedOccurrenceKeys = new Set<ScheduledSampleVoicePlan['occurrenceKey']>()
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
    this.#unsubscribeActiveProjectCommits = dependencies.activeProject.subscribeCommits({
      onCommit: (event) => this.#reconcileActiveProjectCommit(event),
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
      const previousRuntime = this.#preparedRuntime
      previousRuntime?.dispose()
      if (previousRuntime !== null) {
        for (const entry of this.#scheduledVoices) {
          if (entry.runtime === previousRuntime) this.#scheduledVoices.delete(entry)
        }
      }
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
    this.#allNotesOffRuntimes()
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
      this.#allNotesOffRuntimes()
      this.#publishStoppedAtStart()
      return wasLoading
    }

    const transition = transport.returnToStart()
    if (transition.outcome === AUDIBLE_MIDI_TRANSPORT_OUTCOME.RETURNED_TO_START) {
      this.#preparedRuntime?.advanceGeneration(transition.snapshot.engineGeneration)
      this.#allNotesOffRuntimes()
    } else {
      this.#allNotesOffRuntimes()
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
    this.#unsubscribeActiveProjectCommits()
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
      this.#allNotesOffRuntimes()
    } catch {
      // Runtime disposal below remains authoritative after a release failure.
    }
    const runtimes = new Set(this.#retiredRuntimes)
    if (this.#preparedRuntime !== null) runtimes.add(this.#preparedRuntime)
    for (const runtime of runtimes) runtime.dispose()
    this.#preparedRuntime = null
    this.#retiredRuntimes.clear()
    this.#scheduledVoices.clear()
    this.#pendingCommits = []
    this.#pendingCommitEvent = null
    this.#pendingCommitFlushQueued = false
    this.#pendingCommitChainBroken = false
    this.#pendingPlan = null
    this.#suppressedOccurrenceKeys.clear()
    this.#transport = null
    this.#scheduler = null
  }

  #allNotesOffRuntimes(): void {
    let firstFailure: unknown = null
    const runtimes = new Set(this.#retiredRuntimes)
    if (this.#preparedRuntime !== null) runtimes.add(this.#preparedRuntime)
    for (const runtime of runtimes) {
      try {
        runtime.allNotesOff()
      } catch (error) {
        firstFailure ??= error
      }
    }
    if (firstFailure !== null && !this.#disposed) throw firstFailure
  }

  #collectFinishedVoicesAndRuntimes(): void {
    for (const entry of this.#scheduledVoices) {
      let active = false
      try {
        active = entry.handle.isActive()
      } catch {
        // A failed or disposed Runtime cannot retain a usable scheduled Voice.
      }
      if (!active) this.#scheduledVoices.delete(entry)
    }

    for (const runtime of this.#retiredRuntimes) {
      const hasActiveVoice = [...this.#scheduledVoices].some((entry) => entry.runtime === runtime)
      if (hasActiveVoice) continue
      runtime.dispose()
      this.#retiredRuntimes.delete(runtime)
    }
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
    for (const voicePlan of batch.voicePlans) {
      if (this.#suppressedOccurrenceKeys.has(voicePlan.occurrenceKey)) continue
      const handle = preparedRuntime.schedule(voicePlan)
      if (handle !== null) {
        this.#scheduledVoices.add(
          Object.freeze({ handle, plan: voicePlan, runtime: preparedRuntime }),
        )
      }
    }
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

  #reconcileActiveProjectCommit(event: ActiveProjectCommitEvent): void {
    if (this.#disposed) return
    const identity = this.#activePlanIdentity
    if (
      identity === null ||
      identity.projectId !== event.projectId ||
      identity.session !== event.session
    ) {
      return
    }

    const expectedBaseRevision =
      this.#pendingCommits.at(-1)?.modelRevision ?? identity.modelRevision
    if (event.commit.baseRevision !== expectedBaseRevision) {
      this.#pendingCommitChainBroken = true
    }
    this.#pendingCommits.push(event.commit)
    this.#pendingCommitEvent = event

    if (this.#pendingCommitFlushQueued) return
    this.#pendingCommitFlushQueued = true
    void Promise.resolve().then(() => {
      this.#pendingCommitFlushQueued = false
      this.#flushActiveProjectCommits()
    })
  }

  #flushActiveProjectCommits(): void {
    if (this.#disposed) return
    const event = this.#pendingCommitEvent
    const previousPlan = this.#plan
    const identity = this.#activePlanIdentity
    if (event === null || previousPlan === null || identity === null) return
    if (event.projectId !== identity.projectId || event.session !== identity.session) return

    let nextPlan: AudibleMidiProjectPlan
    try {
      nextPlan = compileAudibleMidiProject(event.session.getSnapshot())
    } catch (cause) {
      this.#failCurrentPlan(cause)
      return
    }

    if (
      this.#pendingCommitChainBroken ||
      this.#pendingCommits.at(-1)?.modelRevision !== nextPlan.modelRevision
    ) {
      this.#installStoppedPlan(event, nextPlan)
      return
    }

    let reconciliation: AudibleMidiReconciliationPlan
    try {
      reconciliation = createAudibleMidiReconciliationPlan({
        commits: this.#pendingCommits,
        nextPlan,
        previousPlan,
      })
    } catch (cause) {
      this.#failCurrentPlan(cause)
      return
    }

    const canContinueRuntime =
      (this.#state.phase === PROJECT_PLAYBACK_PHASE.PLAYING ||
        this.#state.phase === PROJECT_PLAYBACK_PHASE.PAUSED) &&
      this.#preparedRuntime !== null &&
      this.#transport !== null &&
      this.#scheduler !== null
    const noteOnly = this.#pendingCommits.every(isMidiNoteReconciliationCommit)
    if (
      !canContinueRuntime ||
      !noteOnly ||
      reconciliation.scope !== AUDIBLE_MIDI_RECONCILIATION_SCOPE.SELECTIVE
    ) {
      this.#installStoppedPlan(event, nextPlan)
      return
    }

    try {
      this.#applyImmediateNoteReconciliation(reconciliation)
    } catch (cause) {
      this.#failCurrentPlan(cause)
      return
    }
    this.#suppressedOccurrenceKeys = new Set(reconciliation.invalidatedPreviousOccurrenceKeys)
    this.#prepareSelectiveHandoff(event, previousPlan, nextPlan)
  }

  #applyImmediateNoteReconciliation(reconciliation: AudibleMidiReconciliationPlan): void {
    const runtime = this.#preparedRuntime
    const transport = this.#transport
    if (runtime === null || transport === null) return
    const now = runtime.now()

    for (const change of reconciliation.occurrenceChanges) {
      if (change.kind === AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.ADDED) continue
      const entries = [...this.#scheduledVoices].filter(
        ({ handle }) => handle.occurrenceKey === change.occurrenceKey,
      )
      for (const entry of entries) {
        if (!entry.handle.isActive()) {
          this.#scheduledVoices.delete(entry)
          continue
        }
        if (entry.plan.startPlaybackClockSecond >= now) {
          entry.handle.cancel(now)
          continue
        }
        if (
          change.kind === AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.REMOVED ||
          change.commandTypes.includes(PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE)
        ) {
          entry.handle.cancel(now)
          continue
        }
        if (
          change.kind !== AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.UPDATED ||
          change.after === null ||
          !change.commandTypes.includes(PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE)
        ) {
          continue
        }

        const nextStart = transport.playbackClockSecondAtTick(change.after.startTick)
        if (nextStart > now) {
          entry.handle.cancel(now)
          continue
        }
        const nextRelease = transport.playbackClockSecondAtTick(change.after.endTick)
        entry.handle.rescheduleRelease(nextRelease)
      }
    }
  }

  #prepareSelectiveHandoff(
    event: ActiveProjectCommitEvent,
    previousPlan: AudibleMidiProjectPlan,
    nextPlan: AudibleMidiProjectPlan,
  ): void {
    this.#preparationAbortController?.abort()
    const abortController = new AbortController()
    const requestSequence = ++this.#requestSequence
    this.#preparationAbortController = abortController
    this.#pendingPlan = nextPlan

    void this.#runtimePort
      .prepare(nextPlan, abortController.signal)
      .then((preparedRuntime) => {
        if (
          this.#disposed ||
          abortController.signal.aborted ||
          requestSequence !== this.#requestSequence ||
          this.#plan !== previousPlan ||
          this.#pendingPlan !== nextPlan ||
          this.#activePlanIdentity?.session !== event.session
        ) {
          preparedRuntime.dispose()
          return
        }
        if (preparedRuntime.modelRevision !== nextPlan.modelRevision) {
          preparedRuntime.dispose()
          throw new ProjectPlaybackError(
            'playback-unavailable',
            'Prepared Playback Runtime does not match the reconciled modelRevision',
          )
        }
        this.#installSelectiveHandoff(event, nextPlan, preparedRuntime)
      })
      .catch((cause: unknown) => {
        if (
          this.#disposed ||
          abortController.signal.aborted ||
          requestSequence !== this.#requestSequence
        ) {
          return
        }
        this.#failCurrentPlan(cause)
      })
      .finally(() => {
        if (this.#preparationAbortController === abortController) {
          this.#preparationAbortController = null
        }
      })
  }

  #installSelectiveHandoff(
    event: ActiveProjectCommitEvent,
    nextPlan: AudibleMidiProjectPlan,
    nextRuntime: ProjectPlaybackPreparedRuntime,
  ): void {
    const transport = this.#transport
    const previousRuntime = this.#preparedRuntime
    if (transport === null || previousRuntime === null) {
      nextRuntime.dispose()
      this.#installStoppedPlan(event, nextPlan)
      return
    }

    const now = previousRuntime.now()
    for (const entry of this.#scheduledVoices) {
      if (entry.plan.startPlaybackClockSecond >= now) entry.handle.cancel(now)
    }
    const transition = transport.handoffPlan(nextPlan)
    nextRuntime.advanceGeneration(transition.snapshot.engineGeneration)

    this.#preparedRuntime = nextRuntime
    this.#retiredRuntimes.add(previousRuntime)
    this.#scheduler = createAudibleMidiSchedulerPlanner(nextPlan, {
      lookAheadHorizonSecond: SCHEDULER_LOOK_AHEAD_HORIZON_SECOND,
      wakeCadenceSecond: SCHEDULER_WAKE_CADENCE_SECOND,
    })
    this.#plan = nextPlan
    this.#activePlanIdentity = Object.freeze({
      modelRevision: nextPlan.modelRevision,
      projectId: event.projectId,
      session: event.session,
    })
    this.#pendingCommits = []
    this.#pendingCommitEvent = null
    this.#pendingCommitChainBroken = false
    this.#pendingPlan = null
    this.#suppressedOccurrenceKeys.clear()

    if (transition.snapshot.state === 'playing') {
      this.#scheduleNextWindow(transition.snapshot)
      this.#startTimer()
    } else {
      this.#stopTimer()
    }
    this.#publishTransportState(transition.snapshot)
    this.#collectFinishedVoicesAndRuntimes()
  }

  #installStoppedPlan(event: ActiveProjectCommitEvent, nextPlan: AudibleMidiProjectPlan): void {
    this.#releasePlanRuntime()
    this.#activePlanIdentity = Object.freeze({
      modelRevision: nextPlan.modelRevision,
      projectId: event.projectId,
      session: event.session,
    })
    this.#plan = nextPlan
    this.#publish(
      createState({
        diagnostics: nextPlan.diagnostics,
        phase: PROJECT_PLAYBACK_PHASE.STOPPED,
        plan: nextPlan,
        projectId: event.projectId,
      }),
    )
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
    if (current?.projectId === state.projectId && current.session === state.session) {
      // ActiveProjectService publishes the matching Ready state before forwarding its Commit.
      // The Commit path owns revision reconciliation so state consumers cannot race it.
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
    this.#collectFinishedVoicesAndRuntimes()
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
