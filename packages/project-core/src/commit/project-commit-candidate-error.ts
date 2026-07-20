import type { ProjectCommandType } from '@/commands/project-command'
import type { ProjectMutationType } from '@/mutation/mutation-type'

export type ProjectCommitCandidateErrorCode =
  | 'base-revision-mismatch'
  | 'command-plan-mismatch'
  | 'unsupported-mutation-type'

export interface ProjectCommitCandidateErrorDetails {
  readonly commandType?: ProjectCommandType
  readonly mutationIndex?: number
  readonly mutationType?: ProjectMutationType | string
}

/** Raised when a write-free candidate cannot truthfully describe its Command and plan. */
export class ProjectCommitCandidateError extends Error {
  readonly code: ProjectCommitCandidateErrorCode
  readonly commandType?: ProjectCommandType
  readonly mutationIndex?: number
  readonly mutationType?: ProjectMutationType | string

  constructor(
    code: ProjectCommitCandidateErrorCode,
    message: string,
    details: ProjectCommitCandidateErrorDetails = {},
  ) {
    super(message)
    this.name = 'ProjectCommitCandidateError'
    this.code = code
    this.commandType = details.commandType
    this.mutationIndex = details.mutationIndex
    this.mutationType = details.mutationType
  }
}
