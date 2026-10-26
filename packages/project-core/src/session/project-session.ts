import { prepareProjectCommand } from '#internal/commands/preparation/project-command-preparer'
import type { ProjectCommand } from '#internal/commands/protocol/project-command'
import {
  createHistoryProjectCommitCandidate,
  createProjectCommitCandidate,
} from '#internal/commit/project-commit-candidate'
import type { ProjectCommit } from '#internal/commit/project-commit'
import {
  HistoryController,
  type PreparedHistoryTransition,
} from '#internal/history/history-controller'
import {
  createInitialModelStore,
  type CreateInitialModelStoreInput,
} from '#internal/model/project-initializer'
import type { ModelRevision } from '#internal/model/model-revision'
import { ModelStore } from '#internal/model/model-store'
import { MutationApplier } from '#internal/mutation/mutation-applier'
import { executeProjectQuery } from '#internal/queries/project-query-executor'
import type { ProjectQuery, ProjectQueryResultFor } from '#internal/queries/project-query'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  type CommittedProjectCommandExecution,
  type NoChangeProjectCommandExecution,
  type ProjectCommandExecutionResult,
} from '#internal/session/project-command-execution'
import type { ProjectContentStateId } from '#internal/session/project-content-state-id'
import { ProjectSnapshots, type ProjectSnapshot } from '#internal/snapshots/project-snapshot'
import { ChangePublisher } from '#internal/subscriptions/change-publisher'
import type {
  ProjectCommitListener,
  ProjectSubscription,
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
  /** A listener that throws is reported and stays subscribed; the other listeners still run. */
  subscribe(subscription: ProjectSubscription, listener: ProjectCommitListener): ProjectUnsubscribe
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
  readonly #changePublisher = new ChangePublisher()
  readonly #snapshots = new ProjectSnapshots()

  constructor(store: ModelStore) {
    this.#store = store
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
    return this.#snapshots.read(this.#store)
  }

  query<Query extends ProjectQuery>(query: Query): ProjectQueryResultFor<Query> {
    return executeProjectQuery(this.getSnapshot(), query)
  }

  subscribe(
    subscription: ProjectSubscription,
    listener: ProjectCommitListener,
  ): ProjectUnsubscribe {
    return this.#changePublisher.subscribe(subscription, listener)
  }

  execute(command: ProjectCommand): ProjectCommandExecutionResult {
    const preparation = prepareProjectCommand(this.#store, command)

    if (preparation.status === PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE) {
      return createNoChangeResult(preparation.baseRevision, preparation.reason)
    }

    const commit = createProjectCommitCandidate(preparation.command, preparation.plan)
    const result = Object.freeze<CommittedProjectCommandExecution>({
      status: PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED,
      commit,
    })
    const historyTransition = this.#history.prepareCommand(
      commit.origin.commandType,
      preparation.plan,
    )
    return this.#applySessionTransition(historyTransition, commit, result)
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
    return this.#applySessionTransition(historyTransition, commit, commit)
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
    return this.#applySessionTransition(historyTransition, commit, commit)
  }

  #applySessionTransition<Result>(
    historyTransition: PreparedHistoryTransition,
    commit: ProjectCommit,
    result: Result,
  ): Result {
    const publication = this.#changePublisher.prepare(commit)

    try {
      historyTransition.stage()
    } catch (error) {
      publication.cancel()
      throw error
    }

    try {
      this.#applier.apply(historyTransition.plan)
    } catch (error) {
      publication.cancel()
      historyTransition.rollback()
      throw error
    }

    // History, Commit/result objects, and the gated publication all exist
    // before apply. A successful revision write is followed only by noting what it touched.
    this.#snapshots.noteChanges(commit.changes)
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
