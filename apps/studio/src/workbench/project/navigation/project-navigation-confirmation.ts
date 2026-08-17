import { parseProjectId, type ProjectContentStateId, type ProjectId } from '@seele-daw/project-core'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  type ActiveProjectSaveStatus,
  type ActiveProjectState,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import { ProjectNavigationConfirmationError } from '@/workbench/project/navigation/project-navigation-confirmation-error'

export const PROJECT_NAVIGATION_INTENT_KIND = {
  CREATE_PROJECT: 'create-project',
  LEAVE_PROJECT: 'leave-project',
  OPEN_PROJECT: 'open-project',
} as const

export const PROJECT_NAVIGATION_DECISION = {
  CANCEL: 'cancel',
  DISCARD: 'discard',
  SAVE: 'save',
} as const

export const PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND = {
  CANCELLED: 'cancelled',
  FAILED: 'failed',
  PROCEED: 'proceed',
} as const

export const PROJECT_NAVIGATION_PROCEED_REASON = {
  CLEAN: 'clean',
  DISCARDED: 'discarded',
  NOT_READY: 'not-ready',
  SAME_PROJECT: 'same-project',
  SAVED: 'saved',
} as const

export const PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION = {
  REQUEST_DECISION: 'request-decision',
  SAVE_PROJECT: 'save-project',
} as const

export type ProjectNavigationDecision =
  (typeof PROJECT_NAVIGATION_DECISION)[keyof typeof PROJECT_NAVIGATION_DECISION]

export type ProjectNavigationProceedReason =
  (typeof PROJECT_NAVIGATION_PROCEED_REASON)[keyof typeof PROJECT_NAVIGATION_PROCEED_REASON]

export type ProjectNavigationConfirmationFailureOperation =
  (typeof PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION)[keyof typeof PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION]

export interface CreateProjectNavigationIntent {
  readonly kind: typeof PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT
}

export interface OpenProjectNavigationIntent {
  readonly kind: typeof PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT
  readonly projectId: ProjectId
}

export interface LeaveProjectNavigationIntent {
  readonly kind: typeof PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT
}

export type ProjectNavigationIntent =
  | CreateProjectNavigationIntent
  | OpenProjectNavigationIntent
  | LeaveProjectNavigationIntent

export interface ProjectNavigationDecisionRequest {
  readonly intent: ProjectNavigationIntent
  readonly activeProjectId: ProjectId
  readonly contentStateId: ProjectContentStateId
  readonly saveStatus: ActiveProjectSaveStatus
  readonly previousSaveFailure: unknown
}

export type ProjectNavigationDecisionRequester = (
  request: ProjectNavigationDecisionRequest,
) => Promise<ProjectNavigationDecision>

export interface ProceedProjectNavigationConfirmationResult {
  readonly kind: typeof PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED
  readonly reason: ProjectNavigationProceedReason
  readonly activeProjectId: ProjectId | null
}

export interface CancelledProjectNavigationConfirmationResult {
  readonly kind: typeof PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.CANCELLED
  readonly activeProjectId: ProjectId
}

export interface FailedProjectNavigationConfirmationResult {
  readonly kind: typeof PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.FAILED
  readonly operation: ProjectNavigationConfirmationFailureOperation
  readonly activeProjectId: ProjectId
  readonly failureCause: unknown
}

export type ProjectNavigationConfirmationResult =
  | ProceedProjectNavigationConfirmationResult
  | CancelledProjectNavigationConfirmationResult
  | FailedProjectNavigationConfirmationResult

export interface ProjectNavigationConfirmationDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'save' | 'state'>
  readonly requestDecision: ProjectNavigationDecisionRequester
}

export interface ProjectNavigationConfirmationCoordinator {
  confirm(intent: ProjectNavigationIntent): Promise<ProjectNavigationConfirmationResult>
}

function normalizeIntent(intent: ProjectNavigationIntent): ProjectNavigationIntent {
  switch (intent.kind) {
    case PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT:
      return Object.freeze({ kind: PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT })
    case PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT:
      return Object.freeze({ kind: PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT })
    case PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT:
      return Object.freeze({
        kind: PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT,
        projectId: parseProjectId(intent.projectId),
      })
    default:
      throw new ProjectNavigationConfirmationError(
        'invalid-intent',
        'Project navigation intent has an unsupported kind',
        { intent },
      )
  }
}

function isNavigationDecision(value: unknown): value is ProjectNavigationDecision {
  return Object.values(PROJECT_NAVIGATION_DECISION).some((decision) => decision === value)
}

function createDecisionRequest(
  intent: ProjectNavigationIntent,
  state: ReadyActiveProjectState,
): ProjectNavigationDecisionRequest {
  return Object.freeze({
    intent,
    activeProjectId: state.projectId,
    contentStateId: state.contentStateId,
    saveStatus: state.saveStatus,
    previousSaveFailure: state.saveFailure,
  })
}

function isDecisionContentCurrent(
  state: ActiveProjectState,
  decisionState: ReadyActiveProjectState,
): state is ReadyActiveProjectState {
  return (
    state.phase === ACTIVE_PROJECT_PHASE.READY &&
    state.projectId === decisionState.projectId &&
    state.contentStateId === decisionState.contentStateId
  )
}

function createProceedResult(
  reason: ProjectNavigationProceedReason,
  activeProjectId: ProjectId | null,
): ProceedProjectNavigationConfirmationResult {
  return Object.freeze({
    kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
    reason,
    activeProjectId,
  })
}

function createCancelledResult(
  activeProjectId: ProjectId,
): CancelledProjectNavigationConfirmationResult {
  return Object.freeze({
    kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.CANCELLED,
    activeProjectId,
  })
}

function createFailedResult(
  operation: ProjectNavigationConfirmationFailureOperation,
  activeProjectId: ProjectId,
  failureCause: unknown,
): FailedProjectNavigationConfirmationResult {
  return Object.freeze({
    kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.FAILED,
    operation,
    activeProjectId,
    failureCause,
  })
}

class ProjectNavigationConfirmationCoordinatorImpl implements ProjectNavigationConfirmationCoordinator {
  readonly #dependencies: ProjectNavigationConfirmationDependencies

  constructor(dependencies: ProjectNavigationConfirmationDependencies) {
    this.#dependencies = dependencies
  }

  async confirm(
    intentInput: ProjectNavigationIntent,
  ): Promise<ProjectNavigationConfirmationResult> {
    const intent = normalizeIntent(intentInput)

    while (true) {
      const observedState = this.#dependencies.activeProject.state
      if (observedState.phase !== ACTIVE_PROJECT_PHASE.READY) {
        return createProceedResult(PROJECT_NAVIGATION_PROCEED_REASON.NOT_READY, null)
      }
      const decisionState = observedState

      if (
        intent.kind === PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT &&
        intent.projectId === decisionState.projectId
      ) {
        return createProceedResult(
          PROJECT_NAVIGATION_PROCEED_REASON.SAME_PROJECT,
          decisionState.projectId,
        )
      }

      if (!decisionState.isDirty) {
        return createProceedResult(PROJECT_NAVIGATION_PROCEED_REASON.CLEAN, decisionState.projectId)
      }

      const decisionRequest = createDecisionRequest(intent, decisionState)
      let decision: ProjectNavigationDecision

      try {
        const requestedDecision = await this.#dependencies.requestDecision(decisionRequest)
        if (!isNavigationDecision(requestedDecision)) {
          throw new ProjectNavigationConfirmationError(
            'invalid-decision',
            'Project navigation decision requester returned an unsupported decision',
            { decision: requestedDecision },
          )
        }
        decision = requestedDecision
      } catch (failureCause) {
        return createFailedResult(
          PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION.REQUEST_DECISION,
          decisionState.projectId,
          failureCause,
        )
      }

      if (decision === PROJECT_NAVIGATION_DECISION.CANCEL) {
        return createCancelledResult(decisionState.projectId)
      }

      // A prompt decision only authorizes the Project History content position the user saw.
      const currentState = this.#dependencies.activeProject.state
      if (!isDecisionContentCurrent(currentState, decisionState)) continue

      if (!currentState.isDirty) {
        return createProceedResult(PROJECT_NAVIGATION_PROCEED_REASON.CLEAN, currentState.projectId)
      }

      if (decision === PROJECT_NAVIGATION_DECISION.DISCARD) {
        return createProceedResult(
          PROJECT_NAVIGATION_PROCEED_REASON.DISCARDED,
          decisionState.projectId,
        )
      }

      try {
        await this.#dependencies.activeProject.save()
      } catch (failureCause) {
        return createFailedResult(
          PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION.SAVE_PROJECT,
          decisionState.projectId,
          failureCause,
        )
      }

      const savedState = this.#dependencies.activeProject.state
      if (
        savedState.phase === ACTIVE_PROJECT_PHASE.READY &&
        savedState.projectId === decisionState.projectId &&
        !savedState.isDirty
      ) {
        return createProceedResult(PROJECT_NAVIGATION_PROCEED_REASON.SAVED, savedState.projectId)
      }

      // Editing may continue while Checkpoint persistence is in flight. Re-evaluate instead of
      // treating a successful but already stale save as permission to abandon newer content.
    }
  }
}

/** Coordinates one framework-neutral permission check before abandoning the Active Project. */
export function createProjectNavigationConfirmationCoordinator(
  dependencies: ProjectNavigationConfirmationDependencies,
): ProjectNavigationConfirmationCoordinator {
  return Object.freeze(new ProjectNavigationConfirmationCoordinatorImpl(dependencies))
}
