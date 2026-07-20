import type { ProjectCommandType } from '@/commands/project-command'
import type { ProjectMutationType } from '@/mutation/mutation-type'

export type ProjectCommitPreparationErrorCode =
  | 'base-revision-mismatch'
  | 'command-plan-mismatch'
  | 'unsupported-mutation-type'

export interface ProjectCommitPreparationErrorDetails {
  readonly commandType?: ProjectCommandType
  readonly mutationIndex?: number
  readonly mutationType?: ProjectMutationType | string
}

/** Raised before model writes when a plan cannot produce a truthful public commit. */
export class ProjectCommitPreparationError extends Error {
  readonly code: ProjectCommitPreparationErrorCode
  readonly commandType?: ProjectCommandType
  readonly mutationIndex?: number
  readonly mutationType?: ProjectMutationType | string

  constructor(
    code: ProjectCommitPreparationErrorCode,
    message: string,
    details: ProjectCommitPreparationErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectCommitPreparationError'
    this.code = code
    this.commandType = details.commandType
    this.mutationIndex = details.mutationIndex
    this.mutationType = details.mutationType
  }
}
