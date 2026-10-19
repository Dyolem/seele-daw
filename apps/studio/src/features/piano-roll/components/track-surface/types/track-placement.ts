import type {
  InteractionId,
  PianoRollGrid,
  PianoRollTimelineViewport,
  PianoRollTrackReadModel,
  PianoRollTrackNotePlacement,
} from '@seele-daw/editor'
import type { ClipId, MidiPitch, ProjectSession, Tick } from '@seele-daw/project-core'

export interface TrackPlacementConfiguration {
  readonly session: Pick<ProjectSession, 'query' | 'subscribe' | 'modelRevision'>
  readonly readModel: PianoRollTrackReadModel
  readonly viewport: PianoRollTimelineViewport
  readonly grid: PianoRollGrid
  readonly tool: 'cursor' | 'pencil'
  readonly snapEnabled: boolean
  readonly barSpanTick: Tick
  readonly timelineEndTick: Tick
  readonly noteDurationTick: Tick
}
export interface TrackPlacementPreview {
  readonly pitch: MidiPitch
  readonly placement: PianoRollTrackNotePlacement
}
export type TrackPlacementResult =
  | Readonly<{ type: 'activate-clip'; clipId: ClipId }>
  | Readonly<{ type: 'place-note'; preview: TrackPlacementPreview }>
export type TrackPlacementIntent = TrackPlacementResult &
  Readonly<{
    interactionId: InteractionId
    target: TrackPlacementConfiguration
  }>
export interface TrackPlacementState {
  readonly awaitingAuthority: boolean
  readonly interactionId: InteractionId | null
  readonly pointerId: number | null
  readonly preview: TrackPlacementPreview | null
}
