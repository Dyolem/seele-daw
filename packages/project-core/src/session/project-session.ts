import { prepareProjectCommand } from '@/commands/project-command-preparer'
import type { ProjectCommand } from '@/commands/project-command'
import { createProjectCommitCandidate } from '@/commit/project-commit-candidate'
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

  execute(command: ProjectCommand): ProjectCommandExecutionResult
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

  constructor(store: ModelStore) {
    this.#store = store
    this.#applier = new MutationApplier(store)
  }

  get modelRevision(): ModelRevision {
    return this.#store.modelRevision
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

    // Keep the successful post-write path to a bare return. Candidate mapping,
    // result allocation, and every other fallible operation happen before apply.
    this.#applier.apply(preparation.plan)

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
