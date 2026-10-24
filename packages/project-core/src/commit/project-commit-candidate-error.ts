import type { ProjectCommandType } from '#internal/commands/protocol/project-command'

export type ProjectCommitCandidateErrorCode = 'base-revision-mismatch'

/** Raised when a Command and the plan prepared for it disagree about their base revision. */
export class ProjectCommitCandidateError extends Error {
  readonly code: ProjectCommitCandidateErrorCode
  readonly commandType: ProjectCommandType

  constructor(
    code: ProjectCommitCandidateErrorCode,
    message: string,
    commandType: ProjectCommandType,
  ) {
    super(message)
    this.name = 'ProjectCommitCandidateError'
    this.code = code
    this.commandType = commandType
  }
}
