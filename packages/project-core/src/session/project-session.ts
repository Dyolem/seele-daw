import { prepareProjectCommand } from '#internal/commands/project-command-preparer'
import type { ProjectCommand } from '#internal/commands/project-command'
import {
  createHistoryProjectCommitCandidate,
  createProjectCommitCandidate,
} from '#internal/commit/project-commit-candidate'
import type { ProjectCommit } from '#internal/commit/project-commit'
import { HistoryController, type PreparedHistoryTransition } from '#internal/history/history-controller'
import {
  createInitialModelStore,
  type CreateInitialModelStoreInput,
} from '#internal/model/project-initializer'
import type { ModelRevision } from '#internal/model/model-revision'
import { ModelStore } from '#internal/model/model-store'
import { MutationApplier } from '#internal/mutation/mutation-applier'
import { QueryIndex, type PreparedQueryIndexTransition } from '#internal/queries/query-index'
import type { ProjectQuery, ProjectQueryResultFor } from '#internal/queries/project-query'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  type CommittedProjectCommandExecution,
  type NoChangeProjectCommandExecution,
  type ProjectCommandExecutionResult,
} from '#internal/session/project-command-execution'
import type { ProjectContentStateId } from '#internal/session/project-content-state-id'
import { createProjectSnapshot, type ProjectSnapshot } from '#internal/snapshots/project-snapshot'
import { ChangePublisher } from '#internal/subscriptions/change-publisher'
import type {
  ProjectSubscription,
  ProjectSubscriptionObserver,
  ProjectUnsubscribe,
} from '#internal/subscriptions/project-subscription'

export type CreateInitialProjectSessionInput = CreateInitialModelStoreInput

/** Public read/write facade for one in-memory project lifetime. */
export interface ProjectSession {
  readonly modelRevision: ModelRevision
  readonly contentStateId: ProjectContentStateId
  readonly canUndo: boolean
  readonly canRedo: boolean

  getSnapshot(): ProjectSnapshot
  query<Query extends ProjectQuery>(query: Query): ProjectQueryResultFor<Query>
  subscribe(
    subscription: ProjectSubscription,
    observer: ProjectSubscriptionObserver,
  ): ProjectUnsubscribe
  execute(command: ProjectCommand): ProjectCommandExecutionResult
  undo(): ProjectCommit | null
  redo(): ProjectCommit | null
}

function createNoChangeResult(
  modelRevision: ModelRevision,
  reason: NoChangeProjectCommandExecution['reason'],
): NoChangeProjectCommandExecution {
  return Object.freeze({
    status: PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE,
    reason,
    modelRevision,
  })
}

class ProjectSessionImpl implements ProjectSession {
  readonly #store: ModelStore
  readonly #applier: MutationApplier
  readonly #history = new HistoryController()
  readonly #queryIndex: QueryIndex
  readonly #changePublisher = new ChangePublisher()

  constructor(store: ModelStore) {
    this.#store = store
    this.#queryIndex = new QueryIndex(store)
    // Claim the unique writer only after every other fallible Session component
    // has constructed successfully, so a failed composition does not strand the Store.
    this.#applier = new MutationApplier(store)
  }

  get modelRevision(): ModelRevision {
    return this.#store.modelRevision
  }

  get contentStateId(): ProjectContentStateId {
    return this.#history.contentStateId
  }

  get canUndo(): boolean {
    return this.#history.canUndo
  }

  get canRedo(): boolean {
    return this.#history.canRedo
  }

  getSnapshot(): ProjectSnapshot {
    return createProjectSnapshot(this.#store)
  }

  query<Query extends ProjectQuery>(query: Query): ProjectQueryResultFor<Query> {
    return this.#queryIndex.execute(this.#store, query)
  }

  subscribe(
    subscription: ProjectSubscription,
    observer: ProjectSubscriptionObserver,
  ): ProjectUnsubscribe {
    return this.#changePublisher.subscribe(subscription, observer)
  }

  execute(command: ProjectCommand): ProjectCommandExecutionResult {
    const preparation = prepareProjectCommand(this.#store, command)

    if (preparation.status === PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE) {
      return createNoChangeResult(preparation.baseRevision, preparation.reason)
    }

    const commit = createProjectCommitCandidate(command, preparation.plan)
    const result = Object.freeze<CommittedProjectCommandExecution>({
      status: PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED,
      commit,
    })
    const historyTransition = this.#history.prepareCommand(
      commit.origin.commandType,
      preparation.plan,
    )
    const queryTransition = this.#queryIndex.prepare(this.#store, commit.delta)

    return this.#applySessionTransition(historyTransition, queryTransition, commit, result)
  }

  undo(): ProjectCommit | null {
    const historyTransition = this.#history.prepareUndo(this.#store.modelRevision)

    if (historyTransition === null) return null

    const commit = createHistoryProjectCommitCandidate(
      {
        direction: historyTransition.direction,
        commandType: historyTransition.commandType,
      },
      historyTransition.plan,
    )
    const queryTransition = this.#queryIndex.prepare(this.#store, commit.delta)

    return this.#applySessionTransition(historyTransition, queryTransition, commit, commit)
  }

  redo(): ProjectCommit | null {
    const historyTransition = this.#history.prepareRedo(this.#store.modelRevision)

    if (historyTransition === null) return null

    const commit = createHistoryProjectCommitCandidate(
      {
        direction: historyTransition.direction,
        commandType: historyTransition.commandType,
      },
      historyTransition.plan,
    )
    const queryTransition = this.#queryIndex.prepare(this.#store, commit.delta)

    return this.#applySessionTransition(historyTransition, queryTransition, commit, commit)
  }

  #applySessionTransition<Result>(
    historyTransition: PreparedHistoryTransition,
    queryTransition: PreparedQueryIndexTransition,
    commit: ProjectCommit,
    result: Result,
  ): Result {
    const publication = this.#changePublisher.prepare(commit)

    try {
      queryTransition.stage()
    } catch (error) {
      publication.cancel()
      throw error
    }

    try {
      historyTransition.stage()
    } catch (error) {
      publication.cancel()
      queryTransition.rollback()
      throw error
    }

    try {
      this.#applier.apply(historyTransition.plan)
    } catch (error) {
      publication.cancel()
      historyTransition.rollback()
      queryTransition.rollback()
      throw error
    }

    // History, QueryIndex, Commit/result objects, and the gated publication all exist
    // before apply. A successful revision write is followed only by this bare return.
    return result
  }
}

/** @internal Composition entry for initial creation and future load boundaries. */
export function createProjectSession(store: ModelStore): ProjectSession {
  return new ProjectSessionImpl(store)
}

/** Creates a public Session around the deterministic minimal project initializer. */
export function createInitialProjectSession(
  input: CreateInitialProjectSessionInput,
): ProjectSession {
  return createProjectSession(createInitialModelStore(input))
}
