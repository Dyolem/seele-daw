import type { ProjectCommandType } from '@/commands/project-command'
import type { ProjectDelta } from '@/commit/project-delta'
import type { ModelRevision } from '@/model/model-revision'
import type { ValueOf } from '@seele-daw/type-utils'

export const PROJECT_COMMIT_ORIGIN_KIND = {
  COMMAND: 'command',
} as const

export type ProjectCommitOriginKind = ValueOf<typeof PROJECT_COMMIT_ORIGIN_KIND>

export interface ProjectCommandCommitOrigin {
  readonly kind: typeof PROJECT_COMMIT_ORIGIN_KIND.COMMAND
  readonly commandType: ProjectCommandType
}

export type ProjectCommitOrigin = ProjectCommandCommitOrigin

/** Public result of one atomic project-model commit. */
export interface ProjectCommit {
  readonly baseRevision: ModelRevision
  readonly modelRevision: ModelRevision
  readonly origin: ProjectCommitOrigin
  readonly delta: ProjectDelta
}
