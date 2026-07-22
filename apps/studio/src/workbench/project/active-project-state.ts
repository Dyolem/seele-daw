import type {
  ModelRevision,
  ProjectContentStateId,
  ProjectCheckpointCandidateFailure,
  ProjectId,
  ProjectSession,
} from '@seele-daw/project-core'

export const ACTIVE_PROJECT_PHASE = {
  CREATE_FAILED: 'create-failed',
  CREATING: 'creating',
  DISPOSED: 'disposed',
  IDLE: 'idle',
  OPEN_FAILED: 'open-failed',
  OPENING: 'opening',
  READY: 'ready',
  SESSION_FAILED: 'session-failed',
} as const

export type ActiveProjectPhase = (typeof ACTIVE_PROJECT_PHASE)[keyof typeof ACTIVE_PROJECT_PHASE]

export const ACTIVE_PROJECT_SAVE_STATUS = {
  FAILED: 'failed',
  IDLE: 'idle',
  SAVING: 'saving',
} as const

export type ActiveProjectSaveStatus =
  (typeof ACTIVE_PROJECT_SAVE_STATUS)[keyof typeof ACTIVE_PROJECT_SAVE_STATUS]

export interface IdleActiveProjectState {
  readonly phase: typeof ACTIVE_PROJECT_PHASE.IDLE
}

export interface OpeningActiveProjectState {
  readonly phase: typeof ACTIVE_PROJECT_PHASE.OPENING
  readonly projectId: ProjectId
}

export interface CreatingActiveProjectState {
  readonly phase: typeof ACTIVE_PROJECT_PHASE.CREATING
  readonly projectId: ProjectId
}

export interface OpenFailedActiveProjectState {
  readonly phase: typeof ACTIVE_PROJECT_PHASE.OPEN_FAILED
  readonly projectId: ProjectId
  readonly failureCause: unknown
}

export interface CreateFailedActiveProjectState {
  readonly phase: typeof ACTIVE_PROJECT_PHASE.CREATE_FAILED
  /** Null only when the injected identity source itself failed validation. */
  readonly projectId: ProjectId | null
  readonly failureCause: unknown
}

export interface SessionFailedActiveProjectState {
  readonly phase: typeof ACTIVE_PROJECT_PHASE.SESSION_FAILED
  readonly projectId: ProjectId
  readonly failureCause: unknown
}

export interface ReadyActiveProjectState {
  readonly phase: typeof ACTIVE_PROJECT_PHASE.READY
  readonly projectId: ProjectId
  readonly session: ProjectSession
  /** Revision observed when this immutable state value was published. */
  readonly modelRevision: ModelRevision
  readonly contentStateId: ProjectContentStateId
  readonly savedRevision: ModelRevision | null
  readonly savedContentStateId: ProjectContentStateId | null
  readonly isDirty: boolean
  readonly saveStatus: ActiveProjectSaveStatus
  readonly saveFailure: unknown
  readonly recoveryFailures: readonly ProjectCheckpointCandidateFailure[]
}

export interface DisposedActiveProjectState {
  readonly phase: typeof ACTIVE_PROJECT_PHASE.DISPOSED
}

export type ActiveProjectState =
  | IdleActiveProjectState
  | CreatingActiveProjectState
  | OpeningActiveProjectState
  | CreateFailedActiveProjectState
  | OpenFailedActiveProjectState
  | SessionFailedActiveProjectState
  | ReadyActiveProjectState
  | DisposedActiveProjectState

export interface ActiveProjectStateDeliveryFailure {
  readonly state: ActiveProjectState
  readonly cause: unknown
}

export interface ActiveProjectStateObserver {
  onStateChange(state: ActiveProjectState): void
  onError(failure: ActiveProjectStateDeliveryFailure): void
}

export type ActiveProjectUnsubscribe = () => void
