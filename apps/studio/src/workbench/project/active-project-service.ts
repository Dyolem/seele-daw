import {
  createAllProjectCommitsSubscription,
  parseProjectId,
  restoreProjectCheckpoint,
  saveProjectCheckpoint,
  type ModelRevision,
  type ProjectContentStateId,
  type ProjectCheckpointCandidateFailure,
  type ProjectCheckpointId,
  type ProjectCheckpointStore,
  type ProjectCommit,
  type ProjectId,
  type ProjectSession,
  type ProjectSubscriptionDeliveryFailure,
} from '@seele-daw/project-core'

import { ActiveProjectError } from '@/workbench/project/active-project-error'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ActiveProjectStateDeliveryFailure,
  type ActiveProjectStateObserver,
  type ActiveProjectUnsubscribe,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'

export interface ActiveProjectServiceDependencies {
  readonly checkpointStore: ProjectCheckpointStore
  readonly createProjectId: () => ProjectId
  readonly createNewSession: (projectId: ProjectId) => ProjectSession
  readonly createCheckpointId: () => ProjectCheckpointId
}

export interface ActiveProjectService {
  readonly state: ActiveProjectState

  create(): Promise<ProjectId>
  open(projectId: ProjectId): Promise<void>
  save(): Promise<void>
  subscribe(observer: ActiveProjectStateObserver): ActiveProjectUnsubscribe
  subscribeCommits(observer: ActiveProjectCommitObserver): ActiveProjectUnsubscribe
  dispose(): void
}

export interface ActiveProjectCommitEvent {
  readonly commit: ProjectCommit
  readonly projectId: ProjectId
  readonly session: ProjectSession
  readonly state: ReadyActiveProjectState
}

export interface ActiveProjectCommitDeliveryFailure {
  readonly event: ActiveProjectCommitEvent
  readonly cause: unknown
}

export interface ActiveProjectCommitObserver {
  onCommit(event: ActiveProjectCommitEvent): void
  onError(failure: ActiveProjectCommitDeliveryFailure): void
}

interface ReadyStateInput {
  readonly projectId: ProjectId
  readonly session: ProjectSession
  readonly savedRevision: ModelRevision | null
  readonly savedContentStateId: ProjectContentStateId | null
  readonly saveStatus: ReadyActiveProjectState['saveStatus']
  readonly saveFailure: unknown
  readonly recoveryFailures: readonly ProjectCheckpointCandidateFailure[]
}

interface StateSubscriptionEntry {
  active: boolean
  readonly observer: ActiveProjectStateObserver
  readonly onStateChange: ActiveProjectStateObserver['onStateChange']
  readonly onError: ActiveProjectStateObserver['onError']
}

interface CommitSubscriptionEntry {
  active: boolean
  readonly observer: ActiveProjectCommitObserver
  readonly onCommit: ActiveProjectCommitObserver['onCommit']
  readonly onError: ActiveProjectCommitObserver['onError']
}

const IDLE_STATE = Object.freeze<ActiveProjectState>({ phase: ACTIVE_PROJECT_PHASE.IDLE })
const DISPOSED_STATE = Object.freeze<ActiveProjectState>({
  phase: ACTIVE_PROJECT_PHASE.DISPOSED,
})

function cloneRecoveryFailures(
  failures: readonly ProjectCheckpointCandidateFailure[],
): readonly ProjectCheckpointCandidateFailure[] {
  return Object.freeze(
    failures.map((failure) =>
      Object.freeze({
        candidateIndex: failure.candidateIndex,
        failureCause: failure.failureCause,
      }),
    ),
  )
}

function createReadyState(input: ReadyStateInput): ReadyActiveProjectState {
  if ((input.savedRevision === null) !== (input.savedContentStateId === null)) {
    throw new Error('Saved revision and content-state identity must be present together')
  }

  const modelRevision = input.session.modelRevision
  const contentStateId = input.session.contentStateId

  return Object.freeze({
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId: input.projectId,
    session: input.session,
    modelRevision,
    contentStateId,
    savedRevision: input.savedRevision,
    savedContentStateId: input.savedContentStateId,
    isDirty:
      input.savedContentStateId === null || contentStateId !== input.savedContentStateId,
    saveStatus: input.saveStatus,
    saveFailure: input.saveFailure,
    recoveryFailures: cloneRecoveryFailures(input.recoveryFailures),
  })
}

function assertStateObserver(observer: ActiveProjectStateObserver): void {
  if (
    typeof observer !== 'object' ||
    observer === null ||
    typeof observer.onStateChange !== 'function' ||
    typeof observer.onError !== 'function'
  ) {
    throw new ActiveProjectError(
      'invalid-observer',
      'Active Project state observer must provide onStateChange and onError functions',
    )
  }
}

function assertCommitObserver(observer: ActiveProjectCommitObserver): void {
  if (
    typeof observer !== 'object' ||
    observer === null ||
    typeof observer.onCommit !== 'function' ||
    typeof observer.onError !== 'function'
  ) {
    throw new ActiveProjectError(
      'invalid-observer',
      'Active Project commit observer must provide onCommit and onError functions',
    )
  }
}

class ActiveProjectServiceImpl implements ActiveProjectService {
  readonly #dependencies: ActiveProjectServiceDependencies
  readonly #subscriptions = new Set<StateSubscriptionEntry>()
  readonly #commitSubscriptions = new Set<CommitSubscriptionEntry>()
  #state: ActiveProjectState = IDLE_STATE
  #sessionUnsubscribe: ActiveProjectUnsubscribe | null = null
  #generation = 0
  #disposed = false

  constructor(dependencies: ActiveProjectServiceDependencies) {
    this.#dependencies = dependencies
  }

  get state(): ActiveProjectState {
    return this.#state
  }

  async create(): Promise<ProjectId> {
    this.#assertLive()
    const generation = ++this.#generation
    let projectId: ProjectId | null = null

    this.#detachSession()

    try {
      projectId = parseProjectId(this.#dependencies.createProjectId())
      this.#setState(Object.freeze({ phase: ACTIVE_PROJECT_PHASE.CREATING, projectId }))

      const existing = await restoreProjectCheckpoint(this.#dependencies.checkpointStore, projectId)
      if (existing !== null) {
        throw new ActiveProjectError(
          'generated-project-id-conflict',
          `Generated Project ID ${projectId} already has a saved Checkpoint`,
          { projectId },
        )
      }

      const session = this.#createAndValidateNewSession(projectId)
      const receipt = await saveProjectCheckpoint(this.#dependencies.checkpointStore, session, {
        checkpointId: this.#dependencies.createCheckpointId(),
      })

      if (this.#isCurrent(generation)) {
        this.#attachSession(projectId, session, generation)
        this.#setState(
          createReadyState({
            projectId,
            session,
            savedRevision: receipt.sourceModelRevision,
            savedContentStateId: receipt.sourceContentStateId,
            saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
            saveFailure: null,
            recoveryFailures: [],
          }),
        )
      }

      return projectId
    } catch (failureCause) {
      if (this.#isCurrent(generation)) {
        this.#detachSession()
        this.#setState(
          Object.freeze({
            phase: ACTIVE_PROJECT_PHASE.CREATE_FAILED,
            projectId,
            failureCause,
          }),
        )
      }

      throw failureCause
    }
  }

  async open(projectId: ProjectId): Promise<void> {
    this.#assertLive()
    const expectedProjectId = parseProjectId(projectId)

    if (
      this.#state.phase === ACTIVE_PROJECT_PHASE.READY &&
      this.#state.projectId === expectedProjectId
    ) {
      return
    }

    const generation = ++this.#generation

    this.#detachSession()
    this.#setState(
      Object.freeze({ phase: ACTIVE_PROJECT_PHASE.OPENING, projectId: expectedProjectId }),
    )

    try {
      const restored = await restoreProjectCheckpoint(
        this.#dependencies.checkpointStore,
        expectedProjectId,
      )

      if (!this.#isCurrent(generation)) return

      if (restored === null) {
        throw new ActiveProjectError(
          'project-not-found',
          `Project ${expectedProjectId} has no saved Checkpoint`,
          { projectId: expectedProjectId },
        )
      }

      const session = restored.session
      this.#attachSession(expectedProjectId, session, generation)
      this.#setState(
        createReadyState({
          projectId: expectedProjectId,
          session,
          savedRevision: session.modelRevision,
          savedContentStateId: session.contentStateId,
          saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
          saveFailure: null,
          recoveryFailures: restored.rejectedCandidates,
        }),
      )
    } catch (failureCause) {
      if (this.#isCurrent(generation)) {
        this.#detachSession()
        this.#setState(
          Object.freeze({
            phase: ACTIVE_PROJECT_PHASE.OPEN_FAILED,
            projectId: expectedProjectId,
            failureCause,
          }),
        )
      }

      throw failureCause
    }
  }

  async save(): Promise<void> {
    this.#assertLive()
    const current = this.#state

    if (current.phase !== ACTIVE_PROJECT_PHASE.READY) {
      throw new ActiveProjectError(
        'project-not-ready',
        `Cannot save an Active Project while it is ${current.phase}`,
        { phase: current.phase },
      )
    }

    if (current.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.SAVING) {
      throw new ActiveProjectError(
        'save-in-progress',
        `Project ${current.projectId} already has a save in progress`,
        { projectId: current.projectId },
      )
    }

    const generation = this.#generation
    const session = current.session
    this.#setState(
      createReadyState({
        projectId: current.projectId,
        session,
        savedRevision: current.savedRevision,
        savedContentStateId: current.savedContentStateId,
        saveStatus: ACTIVE_PROJECT_SAVE_STATUS.SAVING,
        saveFailure: null,
        recoveryFailures: current.recoveryFailures,
      }),
    )

    try {
      const checkpointId = this.#dependencies.createCheckpointId()
      const receipt = await saveProjectCheckpoint(this.#dependencies.checkpointStore, session, {
        checkpointId,
      })

      if (!this.#isActiveSession(generation, session)) return

      const ready = this.#state as ReadyActiveProjectState
      this.#setState(
        createReadyState({
          projectId: ready.projectId,
          session,
          savedRevision: receipt.sourceModelRevision,
          savedContentStateId: receipt.sourceContentStateId,
          saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
          saveFailure: null,
          recoveryFailures: ready.recoveryFailures,
        }),
      )
    } catch (saveFailure) {
      if (this.#isActiveSession(generation, session)) {
        const ready = this.#state as ReadyActiveProjectState
        this.#setState(
          createReadyState({
            projectId: ready.projectId,
            session,
            savedRevision: ready.savedRevision,
            savedContentStateId: ready.savedContentStateId,
            saveStatus: ACTIVE_PROJECT_SAVE_STATUS.FAILED,
            saveFailure,
            recoveryFailures: ready.recoveryFailures,
          }),
        )
      }

      throw saveFailure
    }
  }

  subscribe(observer: ActiveProjectStateObserver): ActiveProjectUnsubscribe {
    this.#assertLive()
    assertStateObserver(observer)

    const entry: StateSubscriptionEntry = {
      active: true,
      observer,
      onStateChange: observer.onStateChange,
      onError: observer.onError,
    }
    this.#subscriptions.add(entry)

    return Object.freeze(() => this.#deactivate(entry))
  }

  subscribeCommits(observer: ActiveProjectCommitObserver): ActiveProjectUnsubscribe {
    this.#assertLive()
    assertCommitObserver(observer)

    const entry: CommitSubscriptionEntry = {
      active: true,
      observer,
      onCommit: observer.onCommit,
      onError: observer.onError,
    }
    this.#commitSubscriptions.add(entry)
    return Object.freeze(() => this.#deactivateCommit(entry))
  }

  dispose(): void {
    if (this.#disposed) return

    this.#disposed = true
    this.#generation += 1
    this.#detachSession()
    this.#setState(DISPOSED_STATE)

    for (const entry of this.#subscriptions) this.#deactivate(entry)
    for (const entry of this.#commitSubscriptions) this.#deactivateCommit(entry)
  }

  #attachSession(projectId: ProjectId, session: ProjectSession, generation: number): void {
    this.#sessionUnsubscribe = session.subscribe(createAllProjectCommitsSubscription(), {
      onCommit: (commit) => {
        if (!this.#isActiveSession(generation, session)) return

        const ready = this.#state as ReadyActiveProjectState
        const nextState = createReadyState({
          projectId,
          session,
          savedRevision: ready.savedRevision,
          savedContentStateId: ready.savedContentStateId,
          saveStatus: ready.saveStatus,
          saveFailure: ready.saveFailure,
          recoveryFailures: ready.recoveryFailures,
        })
        this.#setState(nextState)
        this.#publishCommit(Object.freeze({ commit, projectId, session, state: nextState }))
      },
      onError: (failure) =>
        this.#handleSessionSubscriptionFailure(projectId, session, generation, failure),
    })
  }

  #createAndValidateNewSession(expectedProjectId: ProjectId): ProjectSession {
    const session = this.#dependencies.createNewSession(expectedProjectId)
    const actualProjectId = session.getSnapshot().project.id

    if (actualProjectId !== expectedProjectId) {
      throw new ActiveProjectError(
        'new-session-project-id-mismatch',
        `New Project Session ${actualProjectId} does not match requested Project ${expectedProjectId}`,
        {
          actualProjectId,
          expectedProjectId,
          projectId: expectedProjectId,
        },
      )
    }

    return session
  }

  #handleSessionSubscriptionFailure(
    projectId: ProjectId,
    session: ProjectSession,
    generation: number,
    failure: ProjectSubscriptionDeliveryFailure,
  ): void {
    if (!this.#isActiveSession(generation, session)) return

    const error = new ActiveProjectError(
      'session-subscription-failed',
      `Active Project ${projectId} could no longer observe Session commits`,
      { cause: failure, projectId },
    )
    this.#detachSession()
    this.#setState(
      Object.freeze({
        phase: ACTIVE_PROJECT_PHASE.SESSION_FAILED,
        projectId,
        failureCause: error,
      }),
    )
  }

  #isActiveSession(generation: number, session: ProjectSession): boolean {
    return (
      this.#isCurrent(generation) &&
      this.#state.phase === ACTIVE_PROJECT_PHASE.READY &&
      this.#state.session === session
    )
  }

  #isCurrent(generation: number): boolean {
    return !this.#disposed && this.#generation === generation
  }

  #detachSession(): void {
    this.#sessionUnsubscribe?.()
    this.#sessionUnsubscribe = null
  }

  #setState(state: ActiveProjectState): void {
    this.#state = state
    const entries = [...this.#subscriptions]

    for (const entry of entries) {
      if (!entry.active) continue

      try {
        entry.onStateChange.call(entry.observer, state)
      } catch (cause) {
        this.#deactivate(entry)
        const failure = Object.freeze<ActiveProjectStateDeliveryFailure>({ state, cause })

        try {
          entry.onError.call(entry.observer, failure)
        } catch {
          // The failed observer is already detached; error reporting cannot recurse.
        }
      }
    }
  }

  #deactivate(entry: StateSubscriptionEntry): void {
    if (!entry.active) return

    entry.active = false
    this.#subscriptions.delete(entry)
  }

  #publishCommit(event: ActiveProjectCommitEvent): void {
    for (const entry of this.#commitSubscriptions) {
      if (!entry.active) continue
      try {
        entry.onCommit.call(entry.observer, event)
      } catch (cause) {
        this.#deactivateCommit(entry)
        try {
          entry.onError.call(
            entry.observer,
            Object.freeze<ActiveProjectCommitDeliveryFailure>({ cause, event }),
          )
        } catch {
          // The failed observer is already detached; error reporting cannot recurse.
        }
      }
    }
  }

  #deactivateCommit(entry: CommitSubscriptionEntry): void {
    if (!entry.active) return
    entry.active = false
    this.#commitSubscriptions.delete(entry)
  }

  #assertLive(): void {
    if (this.#disposed) {
      throw new ActiveProjectError('service-disposed', 'Active Project Service is disposed')
    }
  }
}

/** Creates one framework-neutral coordinator for the current Studio project lifetime. */
export function createActiveProjectService(
  dependencies: ActiveProjectServiceDependencies,
): ActiveProjectService {
  return new ActiveProjectServiceImpl(dependencies)
}
