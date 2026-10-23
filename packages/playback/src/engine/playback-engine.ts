import {
  PROJECT_CHANGE_TYPE,
  type ModelRevision,
  type ProjectCommit,
  type ProjectSnapshot,
  type Tick,
} from '@seele-daw/project-core'

import { compileAudibleMidiProject } from '#internal/compiler/audible-midi-compiler'
import {
  AUDIBLE_MIDI_PLAN_STATUS,
  type AudibleMidiProjectPlan,
} from '#internal/compiler/audible-midi-plan'
import {
  PLAYBACK_INSTRUMENT_FAILURE_MODE,
  type InstrumentPreparationFailure,
  type PlaybackAbortSignal,
  type PlaybackRuntimePort,
  type PlaybackTimerPort,
  type PreparedPlaybackRuntime,
  type UnsupportedNoteOccurrence,
} from '#internal/engine/playback-runtime'
import { VoiceLedger } from '#internal/engine/voice-ledger'
import {
  AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND,
  AUDIBLE_MIDI_RECONCILIATION_SCOPE,
  AUDIBLE_MIDI_TRACK_CHANGE_KIND,
  createAudibleMidiReconciliationPlan,
  type AudibleMidiOccurrenceChange,
  type AudibleMidiReconciliationPlan,
} from '#internal/reconciliation/audible-midi-reconciliation'
import {
  AUDIBLE_MIDI_SCHEDULER_OUTCOME,
  createAudibleMidiSchedulerPlanner,
  type AudibleMidiSchedulerPlanner,
  type ScheduledSampleVoicePlan,
} from '#internal/scheduler/audible-midi-scheduler'
import {
  parsePlaybackClockDurationSecond,
  type PlaybackClockSecond,
} from '#internal/time/project-time'
import {
  AUDIBLE_MIDI_TRANSPORT_OUTCOME,
  createAudibleMidiTransport,
  type AudibleMidiTransport,
  type AudibleMidiTransportSnapshot,
} from '#internal/transport/audible-midi-transport'

export const PLAYBACK_PHASE = Object.freeze({
  FAILED: 'failed',
  LOADING: 'loading',
  PAUSED: 'paused',
  PLAYING: 'playing',
  STOPPED: 'stopped',
  UNAVAILABLE: 'unavailable',
} as const)

export type PlaybackPhase = (typeof PLAYBACK_PHASE)[keyof typeof PLAYBACK_PHASE]

export interface PlaybackEngineState {
  readonly phase: PlaybackPhase
  /** The plan playback follows; null when nothing is loaded or its revision failed to compile. */
  readonly plan: AudibleMidiProjectPlan | null
  readonly modelRevision: ModelRevision | null
  readonly positionProjectSecond: number
  /** Why playback failed; null in every other phase. */
  readonly failureCause: unknown
  /** What the playing runtime could not load or play; empty while nothing has been prepared. */
  readonly preparationFailures: readonly InstrumentPreparationFailure[]
  readonly unsupportedNoteOccurrences: readonly UnsupportedNoteOccurrence[]
}

export interface PlaybackVisualPosition {
  readonly modelRevision: ModelRevision | null
  readonly phase: PlaybackPhase
  readonly positionProjectSecond: number
  readonly positionTick: AudibleMidiTransportSnapshot['positionTick']
}

/** One silent ruler locate gesture. */
export interface PlaybackLocateSession {
  readonly startedWhilePlaying: boolean
  cancel(): boolean
  commit(tick: Tick): boolean
}

export interface PlaybackEngine {
  readonly state: PlaybackEngineState
  load(snapshot: ProjectSnapshot): void
  unload(): void
  commit(commit: ProjectCommit, readSnapshot: () => ProjectSnapshot): void
  fail(cause: unknown): void
  readVisualPosition(): PlaybackVisualPosition
  beginTimelineLocate(): PlaybackLocateSession | null
  locateAtTick(tick: Tick): boolean
  canReturnToLastStartPosition(): boolean
  play(): Promise<boolean>
  pause(): boolean
  togglePlayPause(): boolean
  returnToLastStartPosition(): boolean
  dispose(): void
}

export interface PlaybackEngineDependencies {
  readonly runtime: PlaybackRuntimePort
  readonly timer: PlaybackTimerPort
  readonly onStateChange: (state: PlaybackEngineState) => void
}

export type PlaybackEngineErrorCode = 'engine-disposed' | 'playback-unavailable'

/** A request the engine cannot serve in its current state. */
export class PlaybackEngineError extends Error {
  readonly code: PlaybackEngineErrorCode

  constructor(code: PlaybackEngineErrorCode, message: string) {
    super(message)
    this.name = 'PlaybackEngineError'
    this.code = code
  }
}

interface ActiveLocateSession {
  readonly plan: AudibleMidiProjectPlan
  readonly startedWhilePlaying: boolean
}

/** The cancellation handed to one preparation request. */
class PreparationAbort implements PlaybackAbortSignal {
  readonly #listeners = new Set<() => void>()
  #aborted = false

  get aborted(): boolean {
    return this.#aborted
  }

  addEventListener(_type: 'abort', listener: () => void): void {
    if (!this.#aborted) this.#listeners.add(listener)
  }

  removeEventListener(_type: 'abort', listener: () => void): void {
    this.#listeners.delete(listener)
  }

  abort(): void {
    if (this.#aborted) return
    this.#aborted = true
    const listeners = [...this.#listeners]
    this.#listeners.clear()
    for (const listener of listeners) listener()
  }
}

const SCHEDULER_WAKE_CADENCE_SECOND = parsePlaybackClockDurationSecond(0.025)
const SCHEDULER_LOOK_AHEAD_HORIZON_SECOND = parsePlaybackClockDurationSecond(0.2)
const SCHEDULER_WAKE_CADENCE_MILLISECOND = SCHEDULER_WAKE_CADENCE_SECOND * 1_000
const NO_PREPARATION_FAILURES = Object.freeze<readonly InstrumentPreparationFailure[]>([])
const NO_UNSUPPORTED_NOTES = Object.freeze<readonly UnsupportedNoteOccurrence[]>([])
const ZERO_POSITION_TICK = 0 as AudibleMidiTransportSnapshot['positionTick']

const UNAVAILABLE_STATE = Object.freeze<PlaybackEngineState>({
  phase: PLAYBACK_PHASE.UNAVAILABLE,
  plan: null,
  modelRevision: null,
  positionProjectSecond: 0,
  failureCause: null,
  preparationFailures: NO_PREPARATION_FAILURES,
  unsupportedNoteOccurrences: NO_UNSUPPORTED_NOTES,
})

function planState(
  phase: PlaybackPhase,
  plan: AudibleMidiProjectPlan,
  details: Partial<
    Pick<
      PlaybackEngineState,
      | 'failureCause'
      | 'positionProjectSecond'
      | 'preparationFailures'
      | 'unsupportedNoteOccurrences'
    >
  > = {},
): PlaybackEngineState {
  return Object.freeze({
    phase,
    plan,
    modelRevision: plan.modelRevision,
    positionProjectSecond: details.positionProjectSecond ?? 0,
    failureCause: details.failureCause ?? null,
    preparationFailures: details.preparationFailures ?? NO_PREPARATION_FAILURES,
    unsupportedNoteOccurrences: details.unsupportedNoteOccurrences ?? NO_UNSUPPORTED_NOTES,
  })
}

function isPlayablePlan(plan: AudibleMidiProjectPlan): boolean {
  return (
    plan.status === AUDIBLE_MIDI_PLAN_STATUS.PARTIAL ||
    plan.status === AUDIBLE_MIDI_PLAN_STATUS.PLAYABLE
  )
}

/** Playing makes sense only when some note has a sample to play. */
function hasCoveredNote(
  plan: AudibleMidiProjectPlan,
  unsupported: readonly UnsupportedNoteOccurrence[],
): boolean {
  if (plan.midiNoteSpans.length === 0) return false
  if (unsupported.length === 0) return true
  const keys = new Set(unsupported.map(({ occurrenceKey }) => occurrenceKey))
  return plan.midiNoteSpans.some(({ occurrenceKey }) => !keys.has(occurrenceKey))
}

/** Tempo is detected from the Delta, so History commits are routed like the commands they undo. */
function changesTempoMap(commit: ProjectCommit): boolean {
  return commit.delta.changes.some((change) => {
    switch (change.type) {
      case PROJECT_CHANGE_TYPE.TEMPO_EVENT.ADDED:
      case PROJECT_CHANGE_TYPE.TEMPO_EVENT.REMOVED:
      case PROJECT_CHANGE_TYPE.TEMPO_EVENT.UPDATED:
        return true
      default:
        return false
    }
  })
}

/**
 * A sounding voice survives an edit only when its note now ends or releases at another tick, as a
 * resize, a sustain pedal edit or a clip extension does. Any other change needs a new voice.
 */
function onlyReleaseChanged(change: AudibleMidiOccurrenceChange): boolean {
  return change.changedFields.every((field) => field === 'endTick' || field === 'releaseTick')
}

/**
 * Plays one Project revision at a time and follows its commits. It owns the audible plan, the
 * transport and scheduler built from it, the prepared audio runtime and the voices it schedules,
 * and hands playback over to each new revision without restarting it when it can.
 */
class PlaybackEngineImpl implements PlaybackEngine {
  readonly #runtimePort: PlaybackRuntimePort
  readonly #timerPort: PlaybackTimerPort
  readonly #onStateChange: (state: PlaybackEngineState) => void
  readonly #ledger: VoiceLedger
  readonly #clock = Object.freeze({
    now: () => {
      const runtime = this.#runtime
      if (runtime === null) {
        throw new PlaybackEngineError('playback-unavailable', 'Playback has no active audio clock')
      }
      return runtime.now()
    },
  })
  /** The revision playback reflects, set even when that revision failed to compile. */
  #revision: ModelRevision | null = null
  #plan: AudibleMidiProjectPlan | null = null
  #runtime: PreparedPlaybackRuntime | null = null
  #transport: AudibleMidiTransport | null = null
  #scheduler: AudibleMidiSchedulerPlanner | null = null
  #timerHandle: unknown = null
  #preparation: PreparationAbort | null = null
  #requestSequence = 0
  #pendingCommits: ProjectCommit[] = []
  #pendingSnapshot: (() => ProjectSnapshot) | null = null
  #pendingFlushQueued = false
  #pendingChainBroken = false
  #pendingPlan: AudibleMidiProjectPlan | null = null
  #locatedDuringLoading = false
  #preparationFailures = NO_PREPARATION_FAILURES
  #unsupportedNotes = NO_UNSUPPORTED_NOTES
  #suppressedOccurrenceKeys = new Set<ScheduledSampleVoicePlan['occurrenceKey']>()
  #suppressedTrackIds = new Set<ScheduledSampleVoicePlan['trackId']>()
  #state: PlaybackEngineState = UNAVAILABLE_STATE
  #locateSession: ActiveLocateSession | null = null
  #disposed = false

  constructor(dependencies: PlaybackEngineDependencies) {
    this.#runtimePort = dependencies.runtime
    this.#timerPort = dependencies.timer
    this.#onStateChange = dependencies.onStateChange
    this.#ledger = new VoiceLedger(dependencies.timer, SCHEDULER_WAKE_CADENCE_MILLISECOND)
  }

  get state(): PlaybackEngineState {
    return this.#state
  }

  /** Plays `snapshot` from the start, discarding whatever was loaded. */
  load(snapshot: ProjectSnapshot): void {
    this.#assertLive()
    this.#release()
    this.#revision = snapshot.modelRevision
    try {
      const plan = compileAudibleMidiProject(snapshot)
      this.#plan = plan
      this.#installControls(plan)
      this.#publish(planState(PLAYBACK_PHASE.STOPPED, plan))
    } catch (cause) {
      this.#plan = null
      this.#failRevision(snapshot.modelRevision, cause)
    }
  }

  unload(): void {
    this.#assertLive()
    this.#release()
    this.#revision = null
    this.#plan = null
    this.#publish(UNAVAILABLE_STATE)
  }

  /**
   * Follows a commit made on the loaded Project. Commits of one task are reconciled together;
   * `readSnapshot` is read once they are, so it must return the Project's latest snapshot.
   */
  commit(commit: ProjectCommit, readSnapshot: () => ProjectSnapshot): void {
    if (this.#disposed || this.#revision === null) return
    const expectedBaseRevision = this.#pendingCommits.at(-1)?.modelRevision ?? this.#revision
    if (commit.baseRevision !== expectedBaseRevision) this.#pendingChainBroken = true
    this.#pendingCommits.push(commit)
    this.#pendingSnapshot = readSnapshot
    if (this.#pendingFlushQueued) return
    this.#pendingFlushQueued = true
    void Promise.resolve().then(() => {
      this.#pendingFlushQueued = false
      this.#flushCommits()
    })
  }

  /** Fails the current plan, e.g. when the Project's own notifications broke. */
  fail(cause: unknown): void {
    this.#failCurrentPlan(cause)
  }

  readVisualPosition(): PlaybackVisualPosition {
    this.#assertLive()
    const transport = this.#transport
    if (transport === null) return this.#visualPosition()
    try {
      const snapshot = transport.getSnapshot()
      if (this.#state.phase === PLAYBACK_PHASE.PLAYING && snapshot.state !== 'playing') {
        // A visual sample can see the natural end before the scheduler wakes; publish the same
        // transition here and keep the transport's end position.
        this.#stopTimer()
        this.#ledger.startSweep()
        this.#publishTransport(snapshot)
      }
      return this.#visualPosition(snapshot.positionProjectSecond, snapshot.positionTick)
    } catch (cause) {
      this.#failCurrentPlan(cause)
      return this.#visualPosition()
    }
  }

  beginTimelineLocate(): PlaybackLocateSession | null {
    this.#assertLive()
    const plan = this.#plan
    if (this.#transport === null || this.#locateSession !== null || plan === null) return null
    const startedWhilePlaying = this.#state.phase === PLAYBACK_PHASE.PLAYING
    if (startedWhilePlaying && !this.#pauseTransport()) return null
    const session = Object.freeze<ActiveLocateSession>({ plan, startedWhilePlaying })
    this.#locateSession = session
    return Object.freeze({
      startedWhilePlaying,
      cancel: () => this.#cancelLocate(session),
      commit: (tick: Tick) => this.#commitLocate(session, tick),
    })
  }

  locateAtTick(tick: Tick): boolean {
    this.#assertLive()
    if (this.#locateSession !== null) return false
    return this.#locateAtTick(tick)
  }

  canReturnToLastStartPosition(): boolean {
    this.#assertLive()
    if (
      this.#locateSession !== null ||
      this.#state.phase === PLAYBACK_PHASE.LOADING ||
      this.#state.phase === PLAYBACK_PHASE.PAUSED ||
      this.#state.phase === PLAYBACK_PHASE.PLAYING
    ) {
      return true
    }
    if (this.#state.phase !== PLAYBACK_PHASE.STOPPED) return false
    const snapshot = this.#transport?.getSnapshot()
    return (
      snapshot !== undefined && Number(snapshot.positionTick) !== Number(snapshot.returnAnchorTick)
    )
  }

  async play(): Promise<boolean> {
    this.#assertLive()
    const plan = this.#plan
    if (plan === null || !isPlayablePlan(plan)) {
      throw new PlaybackEngineError(
        'playback-unavailable',
        'The loaded Project has no playable plan',
      )
    }
    if (
      this.#locateSession !== null ||
      this.#state.phase === PLAYBACK_PHASE.LOADING ||
      this.#state.phase === PLAYBACK_PHASE.PLAYING
    ) {
      return false
    }
    if (this.#transport === null || this.#scheduler === null) this.#installControls(plan)
    if (
      this.#runtime?.modelRevision === plan.modelRevision &&
      this.#transport !== null &&
      this.#scheduler !== null
    ) {
      return this.#resume()
    }

    const requestSequence = ++this.#requestSequence
    const preparation = new PreparationAbort()
    this.#preparation?.abort()
    this.#preparation = preparation
    this.#locatedDuringLoading = false
    this.#publish(
      planState(PLAYBACK_PHASE.LOADING, plan, {
        positionProjectSecond: this.#state.positionProjectSecond,
      }),
    )

    try {
      const previousRuntime = this.#runtime
      previousRuntime?.dispose()
      if (previousRuntime !== null) this.#ledger.forget(previousRuntime)
      this.#runtime = null
      const runtime = await this.#runtimePort.prepare(plan, preparation, {
        instrumentFailureMode: PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN,
      })
      if (!this.#isCurrentRequest(requestSequence, plan, preparation)) {
        runtime.dispose()
        return false
      }

      this.#runtime = runtime
      this.#preparationFailures = runtime.preparationFailures
      this.#unsupportedNotes = runtime.unsupportedNoteOccurrences
      const transport = this.#transport
      if (transport === null || this.#scheduler === null) {
        throw new PlaybackEngineError(
          'playback-unavailable',
          'Playback has no transport for the loaded plan',
        )
      }

      const pending = transport.getSnapshot()
      if (this.#locatedDuringLoading && Number(pending.positionTick) === pending.timelineEndTick) {
        this.#locatedDuringLoading = false
        this.#publishTransport(pending)
        return true
      }
      if (!hasCoveredNote(plan, this.#unsupportedNotes)) {
        this.#locatedDuringLoading = false
        this.#publishTransport(pending)
        return false
      }

      const transition = transport.play()
      if (transition.outcome !== AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAYED) {
        throw new PlaybackEngineError(
          'playback-unavailable',
          `Transport rejected Play with outcome ${transition.outcome}`,
        )
      }
      runtime.advanceGeneration(transition.snapshot.engineGeneration)
      this.#scheduleNextWindow(transition.snapshot)
      this.#startTimer()
      this.#publishTransport(transition.snapshot)
      this.#locatedDuringLoading = false
      return true
    } catch (cause) {
      if (!this.#isCurrentRequest(requestSequence, plan, preparation)) return false
      this.#failCurrentPlan(cause)
      return false
    } finally {
      if (this.#preparation === preparation) this.#preparation = null
    }
  }

  pause(): boolean {
    this.#assertLive()
    if (this.#locateSession !== null) return false
    return this.#pauseTransport()
  }

  togglePlayPause(): boolean {
    this.#assertLive()
    if (this.#state.phase === PLAYBACK_PHASE.PLAYING) return this.pause()
    if (this.#state.phase === PLAYBACK_PHASE.LOADING) return false
    if (this.#plan === null || !isPlayablePlan(this.#plan)) return false
    void this.play()
    return true
  }

  returnToLastStartPosition(): boolean {
    this.#assertLive()
    this.#locateSession = null
    const wasLoading = this.#state.phase === PLAYBACK_PHASE.LOADING
    this.#cancelPreparation()
    this.#stopTimer()
    try {
      const transport = this.#transport
      if (transport === null) {
        this.#ledger.allNotesOff(this.#runtime)
        this.#ledger.startSweep()
        this.#publishStoppedAtStart()
        return wasLoading
      }
      const transition = transport.returnToLastStartPosition()
      const returned =
        transition.outcome === AUDIBLE_MIDI_TRANSPORT_OUTCOME.RETURNED_TO_LAST_START_POSITION
      if (returned) this.#runtime?.advanceGeneration(transition.snapshot.engineGeneration)
      this.#ledger.allNotesOff(this.#runtime)
      this.#ledger.startSweep()
      this.#publishTransport(transition.snapshot)
      return wasLoading || returned
    } catch (cause) {
      this.#failCurrentPlan(cause)
      return false
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#ledger.close()
    this.#release()
    this.#runtimePort.dispose()
    this.#revision = null
    this.#plan = null
    this.#state = UNAVAILABLE_STATE
  }

  #assertLive(): void {
    if (this.#disposed) throw new PlaybackEngineError('engine-disposed', 'Playback is disposed')
  }

  #publish(state: PlaybackEngineState): void {
    this.#state = state
    this.#onStateChange(state)
  }

  #visualPosition(
    positionProjectSecond = this.#state.positionProjectSecond,
    positionTick = ZERO_POSITION_TICK,
  ): PlaybackVisualPosition {
    return Object.freeze({
      modelRevision: this.#state.modelRevision,
      phase: this.#state.phase,
      positionProjectSecond,
      positionTick,
    })
  }

  #publishStoppedAtStart(): void {
    if (this.#plan !== null) this.#publish(planState(PLAYBACK_PHASE.STOPPED, this.#plan))
  }

  #publishTransport(snapshot: AudibleMidiTransportSnapshot): void {
    const plan = this.#plan
    if (plan === null) return
    let phase: PlaybackPhase
    switch (snapshot.state) {
      case 'paused':
        phase = PLAYBACK_PHASE.PAUSED
        break
      case 'playing':
        phase = PLAYBACK_PHASE.PLAYING
        break
      case 'stopped':
        phase = PLAYBACK_PHASE.STOPPED
        break
    }
    this.#publish(
      planState(phase, plan, {
        positionProjectSecond: snapshot.positionProjectSecond,
        preparationFailures: this.#preparationFailures,
        unsupportedNoteOccurrences: this.#unsupportedNotes,
      }),
    )
  }

  #failCurrentPlan(cause: unknown): void {
    if (this.#disposed) return
    const plan = this.#plan
    this.#release()
    if (plan === null || this.#revision === null) {
      this.#publish(UNAVAILABLE_STATE)
      return
    }
    this.#publish(planState(PLAYBACK_PHASE.FAILED, plan, { failureCause: cause }))
  }

  /** A revision that could not be compiled has no plan to play. */
  #failRevision(revision: ModelRevision, cause: unknown): void {
    this.#publish(
      Object.freeze({
        ...UNAVAILABLE_STATE,
        phase: PLAYBACK_PHASE.FAILED,
        modelRevision: revision,
        failureCause: cause,
      }),
    )
  }

  #failReconciledPlan(nextPlan: AudibleMidiProjectPlan, cause: unknown): void {
    this.#release()
    this.#revision = nextPlan.modelRevision
    this.#plan = nextPlan
    this.#publish(planState(PLAYBACK_PHASE.FAILED, nextPlan, { failureCause: cause }))
  }

  #isCurrentRequest(
    requestSequence: number,
    plan: AudibleMidiProjectPlan,
    preparation: PreparationAbort,
  ): boolean {
    return (
      !this.#disposed &&
      !preparation.aborted &&
      requestSequence === this.#requestSequence &&
      this.#plan === plan
    )
  }

  #cancelPreparation(): void {
    this.#requestSequence += 1
    this.#preparation?.abort()
    this.#preparation = null
  }

  /** Stops everything that plays the current plan; the plan itself stays loaded. */
  #release(): void {
    this.#locateSession = null
    this.#cancelPreparation()
    this.#stopTimer()
    this.#ledger.stopSweep()
    try {
      this.#ledger.allNotesOff(this.#runtime)
    } catch {
      // Disposing the runtimes below still silences them.
    }
    this.#ledger.release(this.#runtime)
    this.#runtime = null
    this.#pendingCommits = []
    this.#pendingSnapshot = null
    this.#pendingFlushQueued = false
    this.#pendingChainBroken = false
    this.#pendingPlan = null
    this.#locatedDuringLoading = false
    this.#preparationFailures = NO_PREPARATION_FAILURES
    this.#unsupportedNotes = NO_UNSUPPORTED_NOTES
    this.#suppressedOccurrenceKeys.clear()
    this.#suppressedTrackIds.clear()
    this.#transport = null
    this.#scheduler = null
  }

  #installControls(plan: AudibleMidiProjectPlan): void {
    this.#transport = createAudibleMidiTransport(plan, this.#clock)
    this.#scheduler = this.#createScheduler(plan)
  }

  #createScheduler(plan: AudibleMidiProjectPlan): AudibleMidiSchedulerPlanner {
    return createAudibleMidiSchedulerPlanner(plan, {
      lookAheadHorizonSecond: SCHEDULER_LOOK_AHEAD_HORIZON_SECOND,
      wakeCadenceSecond: SCHEDULER_WAKE_CADENCE_SECOND,
    })
  }

  #scheduleNextWindow(snapshot: AudibleMidiTransportSnapshot): void {
    const scheduler = this.#scheduler
    const runtime = this.#runtime
    if (scheduler === null || runtime === null) {
      throw new PlaybackEngineError('playback-unavailable', 'Playback scheduling is unavailable')
    }
    const batch = scheduler.planNextWindow(snapshot)
    if (batch.outcome !== AUDIBLE_MIDI_SCHEDULER_OUTCOME.PLANNED) return
    for (const plan of batch.voicePlans) {
      if (
        this.#suppressedOccurrenceKeys.has(plan.occurrenceKey) ||
        this.#suppressedTrackIds.has(plan.trackId)
      ) {
        continue
      }
      const handle = runtime.schedule(plan)
      if (handle !== null) this.#ledger.add(Object.freeze({ handle, plan, runtime }))
    }
  }

  #startTimer(): void {
    this.#ledger.stopSweep()
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

  #tick(): void {
    if (this.#disposed) return
    this.#ledger.collect()
    const transport = this.#transport
    if (transport === null) return
    try {
      const snapshot = transport.getSnapshot()
      if (snapshot.state !== 'playing') {
        this.#stopTimer()
        this.#ledger.startSweep()
        this.#publishTransport(snapshot)
        return
      }
      // The scheduler cadence plans audio only; visual consumers sample the transport themselves.
      this.#scheduleNextWindow(snapshot)
    } catch (cause) {
      this.#failCurrentPlan(cause)
    }
  }

  #pauseTransport(): boolean {
    const transport = this.#transport
    if (transport === null) return false
    try {
      const transition = transport.pause()
      if (transition.outcome !== AUDIBLE_MIDI_TRANSPORT_OUTCOME.PAUSED) return false
      this.#stopTimer()
      this.#runtime?.advanceGeneration(transition.snapshot.engineGeneration)
      this.#ledger.allNotesOff(this.#runtime)
      this.#ledger.startSweep()
      this.#publishTransport(transition.snapshot)
      return true
    } catch (cause) {
      this.#failCurrentPlan(cause)
      return false
    }
  }

  #resume(): boolean {
    const transport = this.#transport
    const runtime = this.#runtime
    const plan = this.#plan
    if (transport === null || runtime === null || this.#scheduler === null || plan === null) {
      return false
    }
    if (!hasCoveredNote(plan, this.#unsupportedNotes)) {
      this.#publishTransport(transport.getSnapshot())
      return false
    }
    try {
      const transition = transport.play()
      if (transition.outcome !== AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAYED) return false
      runtime.advanceGeneration(transition.snapshot.engineGeneration)
      this.#ledger.collect()
      this.#scheduleNextWindow(transition.snapshot)
      this.#startTimer()
      this.#publishTransport(transition.snapshot)
      return true
    } catch (cause) {
      this.#failCurrentPlan(cause)
      return false
    }
  }

  #claimLocate(session: ActiveLocateSession): boolean {
    if (this.#disposed || this.#locateSession !== session) return false
    this.#locateSession = null
    return this.#plan === session.plan
  }

  #cancelLocate(session: ActiveLocateSession): boolean {
    if (!this.#claimLocate(session)) return false
    if (!session.startedWhilePlaying) return true
    return this.#resume()
  }

  #commitLocate(session: ActiveLocateSession, tick: Tick): boolean {
    if (!this.#claimLocate(session)) return false
    return session.startedWhilePlaying ? this.#resumeAt(tick) : this.#locateAtTick(tick)
  }

  #locateAtTick(tick: Tick): boolean {
    const transport = this.#transport
    if (transport === null) return false
    const wasLoading = this.#state.phase === PLAYBACK_PHASE.LOADING
    try {
      const transition = transport.locateAtTick(tick)
      if (wasLoading) {
        this.#locatedDuringLoading = true
        this.#publish(
          Object.freeze({
            ...this.#state,
            positionProjectSecond: transition.snapshot.positionProjectSecond,
          }),
        )
        return true
      }
      if (transition.outcome === AUDIBLE_MIDI_TRANSPORT_OUTCOME.NO_CHANGE) return true
      this.#stopTimer()
      this.#runtime?.advanceGeneration(transition.snapshot.engineGeneration)
      this.#ledger.allNotesOff(this.#runtime)
      this.#ledger.collect()
      if (transition.snapshot.state === 'playing') {
        this.#scheduleNextWindow(transition.snapshot)
        this.#startTimer()
      } else {
        this.#ledger.startSweep()
      }
      this.#publishTransport(transition.snapshot)
      return true
    } catch (cause) {
      this.#failCurrentPlan(cause)
      return false
    }
  }

  #resumeAt(tick: Tick): boolean {
    const transport = this.#transport
    const runtime = this.#runtime
    if (transport === null || runtime === null || this.#scheduler === null) return false
    try {
      const played = transport.play()
      if (played.outcome !== AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAYED) {
        throw new PlaybackEngineError(
          'playback-unavailable',
          `Transport rejected locate resume with outcome ${played.outcome}`,
        )
      }
      const located = transport.locateAtTick(tick)
      runtime.advanceGeneration(located.snapshot.engineGeneration)
      this.#ledger.collect()
      if (located.snapshot.state === 'playing') {
        this.#scheduleNextWindow(located.snapshot)
        this.#startTimer()
      } else {
        this.#stopTimer()
        this.#ledger.startSweep()
      }
      this.#publishTransport(located.snapshot)
      return true
    } catch (cause) {
      this.#failCurrentPlan(cause)
      return false
    }
  }

  /**
   * Reconciles every commit queued since the last flush. A broken chain, a revision that does not
   * match the snapshot, or a change playback cannot follow in place reloads the plan stopped.
   */
  #flushCommits(): void {
    if (this.#disposed) return
    const readSnapshot = this.#pendingSnapshot
    const previousPlan = this.#plan
    const latest = this.#pendingCommits.at(-1)
    if (readSnapshot === null || latest === undefined) return

    let nextPlan: AudibleMidiProjectPlan
    try {
      nextPlan = compileAudibleMidiProject(readSnapshot())
    } catch (cause) {
      this.#release()
      this.#revision = latest.modelRevision
      this.#plan = null
      this.#failRevision(latest.modelRevision, cause)
      return
    }

    if (
      previousPlan === null ||
      this.#pendingChainBroken ||
      latest.modelRevision !== nextPlan.modelRevision
    ) {
      this.#installStoppedPlan(nextPlan)
      return
    }
    if (this.#pendingCommits.some(changesTempoMap)) {
      this.#installTempoHandoff(nextPlan)
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
      this.#failReconciledPlan(nextPlan, cause)
      return
    }

    const canContinue =
      (this.#state.phase === PLAYBACK_PHASE.PLAYING ||
        this.#state.phase === PLAYBACK_PHASE.PAUSED) &&
      this.#runtime !== null &&
      this.#transport !== null &&
      this.#scheduler !== null
    if (!canContinue || reconciliation.scope !== AUDIBLE_MIDI_RECONCILIATION_SCOPE.SELECTIVE) {
      this.#installStoppedPlan(nextPlan)
      return
    }

    try {
      this.#adjustSoundingVoices(reconciliation)
    } catch (cause) {
      this.#failReconciledPlan(nextPlan, cause)
      return
    }
    this.#suppressedOccurrenceKeys = new Set(reconciliation.invalidatedPreviousOccurrenceKeys)
    this.#suppressedTrackIds = new Set(
      reconciliation.trackChanges
        .filter(({ kind }) => kind !== AUDIBLE_MIDI_TRACK_CHANGE_KIND.ADDED)
        .map(({ trackId }) => trackId),
    )
    this.#prepareSelectiveHandoff(previousPlan, nextPlan)
  }

  /** Cuts or retimes the voices the edit changed, before the new runtime is ready. */
  #adjustSoundingVoices(reconciliation: AudibleMidiReconciliationPlan): void {
    const runtime = this.#runtime
    const transport = this.#transport
    if (runtime === null || transport === null) return
    const now = runtime.now()

    for (const change of reconciliation.trackChanges) {
      if (change.kind === AUDIBLE_MIDI_TRACK_CHANGE_KIND.ADDED) continue
      for (const voice of this.#ledger.voices) {
        if (voice.plan.trackId === change.trackId) voice.handle.cancel(now)
      }
    }

    for (const change of reconciliation.occurrenceChanges) {
      if (change.kind === AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.ADDED) continue
      const voices = [...this.#ledger.voices].filter(
        ({ handle }) => handle.occurrenceKey === change.occurrenceKey,
      )
      for (const voice of voices) {
        if (!voice.handle.isActive()) {
          this.#ledger.delete(voice)
          continue
        }
        if (voice.plan.startPlaybackClockSecond >= now) {
          voice.handle.cancel(now)
          continue
        }
        if (change.after === null || !onlyReleaseChanged(change)) {
          voice.handle.cancel(now)
          continue
        }
        if (this.#state.phase !== PLAYBACK_PHASE.PLAYING) {
          voice.handle.cancel(now)
          continue
        }
        const nextStart = transport.playbackClockSecondAtTick(change.after.startTick)
        if (nextStart > now) {
          voice.handle.cancel(now)
          continue
        }
        voice.handle.rescheduleRelease(
          transport.playbackClockSecondAtTick(change.after.releaseTick),
        )
      }
    }
  }

  #prepareSelectiveHandoff(
    previousPlan: AudibleMidiProjectPlan,
    nextPlan: AudibleMidiProjectPlan,
  ): void {
    this.#preparation?.abort()
    const preparation = new PreparationAbort()
    const requestSequence = ++this.#requestSequence
    this.#preparation = preparation
    this.#pendingPlan = nextPlan

    void this.#runtimePort
      .prepare(nextPlan, preparation, {
        instrumentFailureMode: PLAYBACK_INSTRUMENT_FAILURE_MODE.SKIP_UNAVAILABLE_INSTRUMENTS,
      })
      .then((runtime) => {
        if (
          this.#disposed ||
          preparation.aborted ||
          requestSequence !== this.#requestSequence ||
          this.#plan !== previousPlan ||
          this.#pendingPlan !== nextPlan
        ) {
          runtime.dispose()
          return
        }
        if (runtime.modelRevision !== nextPlan.modelRevision) {
          runtime.dispose()
          throw new PlaybackEngineError(
            'playback-unavailable',
            'The prepared runtime does not match the reconciled revision',
          )
        }
        this.#installSelectiveHandoff(nextPlan, runtime)
      })
      .catch((cause: unknown) => {
        if (this.#disposed || preparation.aborted || requestSequence !== this.#requestSequence) {
          return
        }
        this.#failReconciledPlan(nextPlan, cause)
      })
      .finally(() => {
        if (this.#preparation === preparation) this.#preparation = null
      })
  }

  #installSelectiveHandoff(
    nextPlan: AudibleMidiProjectPlan,
    nextRuntime: PreparedPlaybackRuntime,
  ): void {
    this.#locateSession = null
    const transport = this.#transport
    const previousRuntime = this.#runtime
    if (transport === null || previousRuntime === null) {
      nextRuntime.dispose()
      this.#installStoppedPlan(nextPlan)
      return
    }

    const now: PlaybackClockSecond = previousRuntime.now()
    for (const voice of this.#ledger.voices) {
      if (voice.plan.startPlaybackClockSecond >= now) voice.handle.cancel(now)
    }
    const transition = transport.handoffPlan(nextPlan)
    nextRuntime.advanceGeneration(transition.snapshot.engineGeneration)

    this.#runtime = nextRuntime
    this.#preparationFailures = nextRuntime.preparationFailures
    this.#unsupportedNotes = nextRuntime.unsupportedNoteOccurrences
    this.#ledger.retire(previousRuntime)
    this.#scheduler = this.#createScheduler(nextPlan)
    this.#adoptPlan(nextPlan)

    if (transition.snapshot.state === 'playing') {
      this.#scheduleNextWindow(transition.snapshot)
      this.#startTimer()
    } else {
      this.#stopTimer()
      this.#ledger.startSweep()
    }
    this.#publishTransport(transition.snapshot)
    this.#ledger.collect()
  }

  #installStoppedPlan(nextPlan: AudibleMidiProjectPlan): void {
    this.#release()
    this.#revision = nextPlan.modelRevision
    this.#plan = nextPlan
    this.#installControls(nextPlan)
    this.#publish(planState(PLAYBACK_PHASE.STOPPED, nextPlan))
  }

  /**
   * Replaces the wall-clock mapping but keeps the musical position. A playing transport is paused
   * first and its runtime retired, so a tempo edit never resumes playback on its own.
   */
  #installTempoHandoff(nextPlan: AudibleMidiProjectPlan): void {
    this.#locateSession = null
    this.#cancelPreparation()
    this.#stopTimer()
    this.#ledger.stopSweep()

    const transport = this.#transport
    if (transport === null) {
      this.#installStoppedPlan(nextPlan)
      return
    }

    try {
      const startedPlaying = transport.getSnapshot().state === 'playing'
      if (startedPlaying) transport.pause()

      const transition = transport.handoffPlan(nextPlan)
      const previousRuntime = this.#runtime
      previousRuntime?.advanceGeneration(transition.snapshot.engineGeneration)
      if (startedPlaying) this.#ledger.allNotesOff(this.#runtime)
      if (previousRuntime !== null) this.#ledger.retire(previousRuntime)

      this.#runtime = null
      this.#preparationFailures = NO_PREPARATION_FAILURES
      this.#unsupportedNotes = NO_UNSUPPORTED_NOTES
      this.#scheduler = this.#createScheduler(nextPlan)
      this.#locatedDuringLoading = false
      this.#adoptPlan(nextPlan)

      this.#publishTransport(transition.snapshot)
      this.#ledger.startSweep()
      this.#ledger.collect()
    } catch (cause) {
      this.#failReconciledPlan(nextPlan, cause)
    }
  }

  /** Makes a handed-off plan current and clears what the handoff consumed. */
  #adoptPlan(plan: AudibleMidiProjectPlan): void {
    this.#plan = plan
    this.#revision = plan.modelRevision
    this.#pendingCommits = []
    this.#pendingSnapshot = null
    this.#pendingChainBroken = false
    this.#pendingPlan = null
    this.#suppressedOccurrenceKeys.clear()
    this.#suppressedTrackIds.clear()
  }
}

/** Creates a playback engine; it plays nothing until a Project snapshot is loaded. */
export function createPlaybackEngine(dependencies: PlaybackEngineDependencies): PlaybackEngine {
  return new PlaybackEngineImpl(dependencies)
}
