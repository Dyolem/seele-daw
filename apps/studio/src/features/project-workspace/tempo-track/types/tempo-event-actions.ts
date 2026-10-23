import type {
  ModelRevision,
  ProjectCommit,
  ProjectSession,
  TempoEventId,
} from '@seele-daw/project-core'
import type { StudioActionCompletion } from '@/workbench/actions/studio-action'
import type { TempoTrackDragIntent } from './tempo-track-drag'

/** The Page owns playback preparation, the command result and selection cleanup. */
export interface TempoEventActionContext {
  readonly session: ProjectSession | null
  readonly projectedRevision: ModelRevision | null
  commitDrag(intent: TempoTrackDragIntent): ProjectCommit | null
  removeTempoEvent(tempoEventId: TempoEventId): StudioActionCompletion
}
