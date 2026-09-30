import type { EditorPointerInput, InteractionId } from '@seele-daw/editor'
import type {
  ModelRevision,
  ProjectSession,
  TempoBpm,
  TempoEventId,
  Tick,
} from '@seele-daw/project-core'
import type { ProjectTempoEventEditTarget } from '@/workbench/project/tempo-event/types/tempo-event-edit'
import type { ProjectTempoTrackDragAxis, ProjectTempoTrackScale } from './tempo-track'

export interface TempoTrackEventPreview {
  readonly bpm: TempoBpm
  readonly tempoEventId: TempoEventId
  readonly tick: Tick
}

export type TempoTrackPointerInput = EditorPointerInput<{ readonly tempoEventId: TempoEventId }>

export interface TempoTrackDragMapping {
  readonly height: number
  readonly width: number
  readonly scale: ProjectTempoTrackScale
  readonly timelineEndTick: Tick
}

export interface TempoTrackDragConfiguration {
  readonly mapping: TempoTrackDragMapping
  readonly projectedRevision: ModelRevision
  readonly session: ProjectSession
}

export type TempoTrackDragResult =
  | Readonly<{ axis: 'tick'; tempoEventId: TempoEventId; tick: Tick }>
  | Readonly<{ axis: 'bpm'; tempoEventId: TempoEventId; bpm: TempoBpm }>

export type TempoTrackDragIntent = TempoTrackDragResult &
  Readonly<{
    interactionId: InteractionId
    target: ProjectTempoEventEditTarget
  }>

export interface TempoTrackDragPreview extends TempoTrackEventPreview {
  readonly axis: ProjectTempoTrackDragAxis | null
}

export interface TempoTrackDragState {
  readonly awaitingAuthority: boolean
  readonly interactionId: InteractionId | null
  readonly pointerId: number | null
  readonly preview: TempoTrackDragPreview | null
}
