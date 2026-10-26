import {
  PLAYBACK_PHASE,
  type AudibleMidiPlanStatus,
  type PlaybackDiagnostic,
  type PlaybackPhase,
} from '@seele-daw/playback'
import type { ModelRevision, ProjectId } from '@seele-daw/project-core'

/** Studio shows the engine's phases unchanged. */
export const PROJECT_PLAYBACK_PHASE = PLAYBACK_PHASE

export type ProjectPlaybackPhase = PlaybackPhase

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

export type ProjectPlaybackStateListener = (state: ProjectPlaybackState) => void

export type ProjectPlaybackUnsubscribe = () => void
