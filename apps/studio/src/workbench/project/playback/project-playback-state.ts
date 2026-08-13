import type { AudibleMidiPlanStatus, PlaybackDiagnostic } from '@seele-daw/playback'
import type { ModelRevision, ProjectId } from '@seele-daw/project-core'

export const PROJECT_PLAYBACK_PHASE = Object.freeze({
  FAILED: 'failed',
  LOADING: 'loading',
  PAUSED: 'paused',
  PLAYING: 'playing',
  STOPPED: 'stopped',
  UNAVAILABLE: 'unavailable',
} as const)

export type ProjectPlaybackPhase =
  (typeof PROJECT_PLAYBACK_PHASE)[keyof typeof PROJECT_PLAYBACK_PHASE]

export type ProjectPlaybackFeedbackKind = 'error' | 'info' | 'warning'

export interface ProjectPlaybackFeedback {
  readonly kind: ProjectPlaybackFeedbackKind
  readonly message: string
}

export interface ProjectPlaybackState {
  readonly diagnostics: readonly PlaybackDiagnostic[]
  readonly failureCause: unknown
  readonly feedback: ProjectPlaybackFeedback | null
  readonly modelRevision: ModelRevision | null
  readonly phase: ProjectPlaybackPhase
  readonly planStatus: AudibleMidiPlanStatus | null
  readonly positionProjectSecond: number
  readonly projectId: ProjectId | null
}

export interface ProjectPlaybackStateDeliveryFailure {
  readonly cause: unknown
  readonly state: ProjectPlaybackState
}

export interface ProjectPlaybackStateObserver {
  onError(failure: ProjectPlaybackStateDeliveryFailure): void
  onStateChange(state: ProjectPlaybackState): void
}

export type ProjectPlaybackUnsubscribe = () => void
