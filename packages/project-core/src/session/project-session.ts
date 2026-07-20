import { prepareProjectCommand } from '@/commands/project-command-preparer'
import type { ProjectCommand } from '@/commands/project-command'
import {
  createHistoryProjectCommitCandidate,
  createProjectCommitCandidate,
} from '@/commit/project-commit-candidate'
import type { ProjectCommit } from '@/commit/project-commit'
import { HistoryController, type PreparedHistoryTransition } from '@/history/history-controller'
import {
  createInitialModelStore,
  type CreateInitialModelStoreInput,
} from '@/model/project-initializer'
import type { ModelRevision } from '@/model/model-revision'
import { ModelStore } from '@/model/model-store'
import { MutationApplier } from '@/mutation/mutation-applier'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  type CommittedProjectCommandExecution,
  type NoChangeProjectCommandExecution,
  type ProjectCommandExecutionResult,
} from '@/session/project-command-execution'

export type CreateInitialProjectSessionInput = CreateInitialModelStoreInput

/** Public write facade for one in-memory project lifetime. */
export interface ProjectSession {
  readonly modelRevision: ModelRevision
  readonly canUndo: boolean
  readonly canRedo: boolean

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

  constructor(store: ModelStore) {
    this.#store = store
    this.#applier = new MutationApplier(store)
  }

  get modelRevision(): ModelRevision {
    return this.#store.modelRevision
  }

  get canUndo(): boolean {
    return this.#history.canUndo
  }

  get canRedo(): boolean {
    return this.#history.canRedo
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

    return this.#applyHistoryTransition(historyTransition, result)
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

    return this.#applyHistoryTransition(historyTransition, commit)
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

    return this.#applyHistoryTransition(historyTransition, commit)
  }

  #applyHistoryTransition<Result>(
    historyTransition: PreparedHistoryTransition,
    result: Result,
  ): Result {
    historyTransition.stage()

    try {
      this.#applier.apply(historyTransition.plan)
    } catch (error) {
      historyTransition.rollback()
      throw error
    }

    // The History nodes, Commit/result objects, and rollback closure all exist before
    // apply. A successful revision write is followed only by this bare return.
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
