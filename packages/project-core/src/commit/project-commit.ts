import type { ProjectCommandType } from '#internal/commands/project-command'
import type { ProjectDelta } from '#internal/commit/project-delta'
import type { ModelRevision } from '#internal/model/model-revision'
import type { ValueOf } from '@seele-daw/type-utils'

export const PROJECT_COMMIT_ORIGIN_KIND = {
  COMMAND: 'command',
  HISTORY: 'history',
} as const

export const PROJECT_HISTORY_DIRECTION = {
  REDO: 'redo',
  UNDO: 'undo',
} as const

export type ProjectCommitOriginKind = ValueOf<typeof PROJECT_COMMIT_ORIGIN_KIND>
export type ProjectHistoryDirection = ValueOf<typeof PROJECT_HISTORY_DIRECTION>

export interface ProjectCommandCommitOrigin {
  readonly kind: typeof PROJECT_COMMIT_ORIGIN_KIND.COMMAND
  readonly commandType: ProjectCommandType
}

export interface ProjectHistoryCommitOrigin {
  readonly kind: typeof PROJECT_COMMIT_ORIGIN_KIND.HISTORY
  readonly direction: ProjectHistoryDirection
  readonly commandType: ProjectCommandType
}

export type ProjectCommitOrigin = ProjectCommandCommitOrigin | ProjectHistoryCommitOrigin

/** Public result of one atomic project-model commit. */
export interface ProjectCommit {
  readonly baseRevision: ModelRevision
  readonly modelRevision: ModelRevision
  readonly origin: ProjectCommitOrigin
  readonly delta: ProjectDelta
}
