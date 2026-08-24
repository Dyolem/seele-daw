import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddTempoEventCommand,
  createMoveTempoEventCommand,
  createRemoveTempoEventCommand,
  createReplaceTempoEventBpmCommand,
  parseTempoEventId,
  type ProjectCommit,
  type ProjectCommandExecutionResult,
  type TempoBpm,
  type TempoEventId,
  type Tick,
} from '@seele-daw/project-core'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import { ProjectTempoEventError } from '@/workbench/project/tempo-event/project-tempo-event-error'

export interface ProjectTempoEventCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'state'>
  readonly createUniqueId: () => string
}

export interface AddProjectTempoEventInput {
  readonly bpm: TempoBpm
  readonly tick: Tick
}

export interface AddedProjectTempoEventResult {
  readonly commit: ProjectCommit
  readonly tempoEventId: TempoEventId
}

export interface MoveProjectTempoEventInput {
  readonly tempoEventId: TempoEventId
  readonly tick: Tick
}

export interface ReplaceProjectTempoEventBpmInput {
  readonly bpm: TempoBpm
  readonly tempoEventId: TempoEventId
}

export interface ProjectTempoEventCoordinator {
  addTempoEvent(input: AddProjectTempoEventInput): AddedProjectTempoEventResult
  moveTempoEvent(input: MoveProjectTempoEventInput): ProjectCommandExecutionResult
  removeTempoEvent(tempoEventId: TempoEventId): ProjectCommandExecutionResult
  replaceTempoEventBpm(input: ReplaceProjectTempoEventBpmInput): ProjectCommandExecutionResult
}

class ProjectTempoEventCoordinatorImpl implements ProjectTempoEventCoordinator {
  readonly #dependencies: ProjectTempoEventCoordinatorDependencies

  constructor(dependencies: ProjectTempoEventCoordinatorDependencies) {
    this.#dependencies = dependencies
  }

  addTempoEvent(input: AddProjectTempoEventInput): AddedProjectTempoEventResult {
    const session = this.#readySession('add')
    const tempoEventId = parseTempoEventId(this.#dependencies.createUniqueId())
    const result = session.execute(
      createAddTempoEventCommand({
        baseRevision: session.modelRevision,
        bpm: input.bpm,
        tempoEventId,
        tick: input.tick,
      }),
    )

    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new ProjectTempoEventError(
        'tempo-event-add-produced-no-change',
        'AddTempoEventCommand unexpectedly produced no Project change',
      )
    }

    return Object.freeze({ commit: result.commit, tempoEventId })
  }

  moveTempoEvent(input: MoveProjectTempoEventInput): ProjectCommandExecutionResult {
    const session = this.#readySession('move')
    return session.execute(
      createMoveTempoEventCommand({
        baseRevision: session.modelRevision,
        tempoEventId: input.tempoEventId,
        tick: input.tick,
      }),
    )
  }

  removeTempoEvent(tempoEventId: TempoEventId): ProjectCommandExecutionResult {
    const session = this.#readySession('remove')
    return session.execute(
      createRemoveTempoEventCommand({
        baseRevision: session.modelRevision,
        tempoEventId,
      }),
    )
  }

  replaceTempoEventBpm(input: ReplaceProjectTempoEventBpmInput): ProjectCommandExecutionResult {
    const session = this.#readySession('replace BPM for')
    return session.execute(
      createReplaceTempoEventBpmCommand({
        baseRevision: session.modelRevision,
        bpm: input.bpm,
        tempoEventId: input.tempoEventId,
      }),
    )
  }

  #readySession(intent: string) {
    const activeState = this.#dependencies.activeProject.state
    if (activeState.phase !== ACTIVE_PROJECT_PHASE.READY) {
      throw new ProjectTempoEventError(
        'active-project-not-ready',
        `Cannot ${intent} a Tempo Event while the Active Project is ${activeState.phase}`,
        { phase: activeState.phase },
      )
    }
    return activeState.session
  }
}

/** Creates the framework-neutral Tempo Event command capability for the Active Project. */
export function createProjectTempoEventCoordinator(
  dependencies: ProjectTempoEventCoordinatorDependencies,
): ProjectTempoEventCoordinator {
  return Object.freeze(new ProjectTempoEventCoordinatorImpl(dependencies))
}
