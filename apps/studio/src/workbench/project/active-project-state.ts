import type {
  ModelRevision,
  ProjectCheckpointCandidateFailure,
  ProjectId,
  ProjectSession,
} from '@seele-daw/project-core'

export const ACTIVE_PROJECT_PHASE = {
  DISPOSED: 'disposed',
  IDLE: 'idle',
  OPEN_FAILED: 'open-failed',
  OPENING: 'opening',
  READY: 'ready',
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

export interface OpenFailedActiveProjectState {
  readonly phase: typeof ACTIVE_PROJECT_PHASE.OPEN_FAILED
  readonly projectId: ProjectId
  readonly failureCause: unknown
}

export interface ReadyActiveProjectState {
  readonly phase: typeof ACTIVE_PROJECT_PHASE.READY
  readonly projectId: ProjectId
  readonly session: ProjectSession
  /** Revision observed when this immutable state value was published. */
  readonly modelRevision: ModelRevision
  readonly savedRevision: ModelRevision | null
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
  | OpeningActiveProjectState
  | OpenFailedActiveProjectState
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
