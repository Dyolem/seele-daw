import type { ProjectCommit } from '@/commit/project-commit'
import type { ModelRevision } from '@/model/model-revision'
import type { ValueOf } from '@seele-daw/type-utils'

export const PROJECT_COMMAND_EXECUTION_STATUS = {
  COMMITTED: 'committed',
  NO_CHANGE: 'no-change',
} as const

export type ProjectCommandExecutionStatus = ValueOf<typeof PROJECT_COMMAND_EXECUTION_STATUS>

export interface CommittedProjectCommandExecution {
  readonly status: typeof PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED
  readonly commit: ProjectCommit
}

export interface NoChangeProjectCommandExecution {
  readonly status: typeof PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE
  readonly reason: 'already-at-target'
  readonly modelRevision: ModelRevision
}

export type ProjectCommandExecutionResult =
  | CommittedProjectCommandExecution
  | NoChangeProjectCommandExecution
