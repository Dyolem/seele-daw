import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  type ModelRevision,
  type ProjectCommand,
  type ProjectCommit,
  type ProjectSession,
} from '@seele-daw/project-core'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'

export interface ProjectEditContext {
  readonly activeProject: Pick<ActiveProjectService, 'state'>
  readonly createId: () => string
  /** Uniform value in [0, 1) for randomized product defaults such as Track colors. */
  readonly random: () => number
}

/**
 * Failures a user can act on. Business invariants are Project Core's to reject; these codes only
 * describe the Studio preconditions around a Command.
 */
export type ProjectEditErrorCode =
  | 'project-not-ready'
  | 'target-stale'
  | 'unsupported'
  | 'not-placeable'

export class ProjectEditError extends Error {
  readonly code: ProjectEditErrorCode

  constructor(code: ProjectEditErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectEditError'
    this.code = code
  }
}

/** What a gesture captured when it started; either changing makes the gesture stale. */
export interface EditAuthority {
  readonly expectedSession?: object
  readonly baseRevision?: ModelRevision
}

export function staleEdit(): ProjectEditError {
  return new ProjectEditError(
    'target-stale',
    'The project changed before the edit could complete. Try again.',
  )
}

export function requireEditSession(
  context: Pick<ProjectEditContext, 'activeProject'>,
  authority: EditAuthority = {},
): ProjectSession {
  const state = context.activeProject.state
  if (state.phase !== ACTIVE_PROJECT_PHASE.READY) {
    throw new ProjectEditError(
      'project-not-ready',
      `The project cannot be edited while it is ${state.phase}.`,
    )
  }
  const { session } = state
  if (authority.expectedSession !== undefined && authority.expectedSession !== session) {
    throw staleEdit()
  }
  // Checked before any snapshot-derived calculation, so a stale gesture is never re-targeted.
  if (authority.baseRevision !== undefined && authority.baseRevision !== session.modelRevision) {
    throw staleEdit()
  }
  return session
}

/** Returns the Commit, or null when Project Core accepted the Command as a no-op. */
export function executeEdit(
  session: ProjectSession,
  command: ProjectCommand,
): ProjectCommit | null {
  const result = session.execute(command)
  return result.status === PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED ? result.commit : null
}

/** For Commands that always change the Project once Project Core accepts them. */
export function executeRequiredEdit(
  session: ProjectSession,
  command: ProjectCommand,
): ProjectCommit {
  const commit = executeEdit(session, command)
  if (commit === null) throw new Error(`${command.type} unexpectedly produced no Project change`)
  return commit
}
