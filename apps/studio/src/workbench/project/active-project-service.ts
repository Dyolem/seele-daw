import {
  createAllProjectCommitsSubscription,
  parseProjectId,
  reportListenerError,
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
} from '@seele-daw/project-core'

import { ActiveProjectError } from '@/workbench/project/active-project-error'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ActiveProjectStateListener,
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
  /** Persists and activates a caller-constructed, already validated Project Session. */
  createFromSession(session: ProjectSession): Promise<ProjectId>
  open(projectId: ProjectId): Promise<void>
  save(): Promise<void>
  subscribe(listener: ActiveProjectStateListener): ActiveProjectUnsubscribe
  /** Called after the ready state of each commit's revision has been published. */
  subscribeCommits(listener: ActiveProjectCommitListener): ActiveProjectUnsubscribe
  dispose(): void
}

export interface ActiveProjectCommitEvent {
  readonly commit: ProjectCommit
  readonly projectId: ProjectId
  readonly session: ProjectSession
  readonly state: ReadyActiveProjectState
}

export type ActiveProjectCommitListener = (event: ActiveProjectCommitEvent) => void

interface ReadyStateInput {
  readonly projectId: ProjectId
  readonly session: ProjectSession
  readonly savedRevision: ModelRevision | null
  readonly savedContentStateId: ProjectContentStateId | null
  readonly saveStatus: ReadyActiveProjectState['saveStatus']
  readonly saveFailure: unknown
  readonly recoveryFailures: readonly ProjectCheckpointCandidateFailure[]
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
    isDirty: input.savedContentStateId === null || contentStateId !== input.savedContentStateId,
    saveStatus: input.saveStatus,
    saveFailure: input.saveFailure,
    recoveryFailures: cloneRecoveryFailures(input.recoveryFailures),
  })
}

class ActiveProjectServiceImpl implements ActiveProjectService {
  readonly #dependencies: ActiveProjectServiceDependencies
  readonly #listeners = new Set<ActiveProjectStateListener>()
  readonly #commitListeners = new Set<ActiveProjectCommitListener>()
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
      const expectedProjectId = projectId
      await this.#persistAndActivateNewProject(
        expectedProjectId,
        () => this.#createAndValidateNewSession(expectedProjectId),
        generation,
        'generated-project-id-conflict',
      )

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

  async createFromSession(session: ProjectSession): Promise<ProjectId> {
    this.#assertLive()
    const generation = ++this.#generation
    let projectId: ProjectId | null = null

    this.#detachSession()

    try {
      projectId = parseProjectId(session.getSnapshot().project.id)
      const expectedProjectId = projectId
      await this.#persistAndActivateNewProject(
        expectedProjectId,
        () => this.#validateSessionProjectId(session, expectedProjectId),
        generation,
        'project-id-conflict',
      )
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
      )
    }

    if (current.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.SAVING) {
      throw new ActiveProjectError(
        'save-in-progress',
        `Project ${current.projectId} already has a save in progress`,
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

  subscribe(listener: ActiveProjectStateListener): ActiveProjectUnsubscribe {
    this.#assertLive()
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  subscribeCommits(listener: ActiveProjectCommitListener): ActiveProjectUnsubscribe {
    this.#assertLive()
    this.#commitListeners.add(listener)
    return () => {
      this.#commitListeners.delete(listener)
    }
  }

  dispose(): void {
    if (this.#disposed) return

    this.#disposed = true
    this.#generation += 1
    this.#detachSession()
    this.#setState(DISPOSED_STATE)

    this.#listeners.clear()
    this.#commitListeners.clear()
  }

  #attachSession(projectId: ProjectId, session: ProjectSession, generation: number): void {
    this.#sessionUnsubscribe = session.subscribe(
      createAllProjectCommitsSubscription(),
      (commit) => {
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
    )
  }

  #createAndValidateNewSession(expectedProjectId: ProjectId): ProjectSession {
    const session = this.#dependencies.createNewSession(expectedProjectId)
    return this.#validateSessionProjectId(session, expectedProjectId)
  }

  #validateSessionProjectId(session: ProjectSession, expectedProjectId: ProjectId): ProjectSession {
    const actualProjectId = session.getSnapshot().project.id

    if (actualProjectId !== expectedProjectId) {
      throw new ActiveProjectError(
        'new-session-project-id-mismatch',
        `Project Session ${actualProjectId} does not match requested Project ${expectedProjectId}`,
      )
    }

    return session
  }

  async #persistAndActivateNewProject(
    projectId: ProjectId,
    createSession: () => ProjectSession,
    generation: number,
    conflictCode: 'generated-project-id-conflict' | 'project-id-conflict',
  ): Promise<void> {
    this.#setState(Object.freeze({ phase: ACTIVE_PROJECT_PHASE.CREATING, projectId }))

    const existing = await restoreProjectCheckpoint(this.#dependencies.checkpointStore, projectId)
    if (existing !== null) {
      throw new ActiveProjectError(
        conflictCode,
        `Project ID ${projectId} already has a saved Checkpoint`,
      )
    }

    const session = createSession()
    const receipt = await saveProjectCheckpoint(this.#dependencies.checkpointStore, session, {
      checkpointId: this.#dependencies.createCheckpointId(),
    })

    if (!this.#isCurrent(generation)) return

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
    for (const listener of this.#listeners) {
      try {
        listener(state)
      } catch (cause) {
        reportListenerError(cause)
      }
    }
  }

  #publishCommit(event: ActiveProjectCommitEvent): void {
    for (const listener of this.#commitListeners) {
      try {
        listener(event)
      } catch (cause) {
        reportListenerError(cause)
      }
    }
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
