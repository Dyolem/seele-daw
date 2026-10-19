import type {
  ClipId,
  MidiChannel,
  MidiSustainPedalEventId,
  ModelRevision,
  ProjectSession,
  TrackId,
} from '@seele-daw/project-core'
import type { InteractionId } from '#internal/common/interaction/interaction-session'
import type { PianoRollPointerInput } from '#internal/common/piano-roll/piano-roll-input'
import type { PianoRollValueLaneViewport } from '#internal/common/piano-roll/value-lane/piano-roll-value-lane-viewport'
import type { TimelineGrid } from '#internal/common/timeline-grid'
import type { PianoRollSustainPedalEditingScope } from './sustain-pedal-editing-scope'
import type { PianoRollSustainPedalLaneHit } from './sustain-pedal-lane-input'
import type { PianoRollSustainPedalPlacement } from './sustain-pedal-pencil-interaction'
import type {
  PianoRollSustainPedalMovePreview,
  PianoRollSustainPedalValuePreview,
  PianoRollSustainPedalTransformAxis,
  PianoRollSustainPedalTransformGesture,
  PianoRollSustainPedalTransformPreview,
} from './sustain-pedal-event-transform'

export const PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS = {
  AWAITING_AUTHORITY: 'awaiting-authority',
  COMMITTING_MOVE: 'committing-move',
  COMMITTING_VALUE: 'committing-value',
  IDLE: 'idle',
  COMPLETING: 'completing',
  MOVING_EVENTS: 'moving-events',
  PRESSING: 'pressing',
  REPLACING_VALUE: 'replacing-value',
} as const

export type PianoRollSustainPedalInteractionStatus =
  (typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS)[keyof typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_STATUS]

export const PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT = {
  MOVE_EVENTS: 'sustain-pedal-events.move',
  PLACE_EVENT: 'sustain-pedal-event.place',
  REPLACE_VALUE: 'sustain-pedal-event.replace-value',
  RESOLVE_SELECTION: 'sustain-pedal-selection.resolve',
} as const

export interface PianoRollSustainPedalResolveSelectionIntent extends SustainPedalCompletion {
  readonly selectedEventIds: readonly MidiSustainPedalEventId[]
  readonly type: typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.RESOLVE_SELECTION
}

export interface PianoRollSustainPedalPlaceEventIntent extends SustainPedalCompletion {
  readonly placement: PianoRollSustainPedalPlacement
  readonly type: typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT
}

export interface PianoRollSustainPedalMoveEventsIntent extends SustainPedalCompletion {
  readonly gesture: PianoRollSustainPedalTransformGesture
  readonly preview: PianoRollSustainPedalMovePreview
  readonly type: typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.MOVE_EVENTS
}

export interface PianoRollSustainPedalReplaceValueIntent extends SustainPedalCompletion {
  readonly gesture: PianoRollSustainPedalTransformGesture
  readonly preview: PianoRollSustainPedalValuePreview
  readonly type: typeof PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.REPLACE_VALUE
}

export type PianoRollSustainPedalInteractionIntent =
  | PianoRollSustainPedalMoveEventsIntent
  | PianoRollSustainPedalPlaceEventIntent
  | PianoRollSustainPedalReplaceValueIntent
  | PianoRollSustainPedalResolveSelectionIntent

export interface PianoRollSustainPedalInteractionTarget {
  readonly session: Pick<ProjectSession, 'query' | 'modelRevision' | 'subscribe'>
  readonly baseRevision: ModelRevision
  readonly channel: MidiChannel
  readonly activeClipId: ClipId | null
  readonly trackId: TrackId | null
}

interface SustainPedalCompletion {
  readonly interactionId: InteractionId
  readonly target: PianoRollSustainPedalInteractionTarget
}

export interface PianoRollSustainPedalInteractionConfiguration {
  readonly target: PianoRollSustainPedalInteractionTarget
  readonly grid: TimelineGrid
  readonly scope: PianoRollSustainPedalEditingScope | null
  readonly selectedEventIds: readonly MidiSustainPedalEventId[]
  readonly snapEnabled: boolean
  readonly tool: 'cursor' | 'pencil'
  readonly viewport: PianoRollValueLaneViewport
}

export interface PianoRollSustainPedalInteractionOutcome {
  readonly failure: unknown | null
  readonly intent: PianoRollSustainPedalInteractionIntent | null
}

export interface PianoRollSustainPedalInteractionState {
  readonly interactionId: InteractionId | null
  readonly activeAxis: PianoRollSustainPedalTransformAxis | null
  readonly pointerId: number | null
  readonly preview: PianoRollSustainPedalTransformPreview | null
  readonly status: PianoRollSustainPedalInteractionStatus
}

export interface PianoRollSustainPedalInteractionSessionObserver {
  onStateChange(state: PianoRollSustainPedalInteractionState): void
}

export interface ResolvePianoRollSustainPedalCommitInput {
  readonly interactionId: InteractionId
  readonly authorityRevision: ModelRevision
  readonly commitRevision: ModelRevision
}

export interface PianoRollSustainPedalInteractionSession {
  readonly state: PianoRollSustainPedalInteractionState
  cancel(): boolean
  dispose(): void
  handlePointerInput(
    input: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
    configuration?: PianoRollSustainPedalInteractionConfiguration,
  ): PianoRollSustainPedalInteractionOutcome
  notifyAuthorityRevision(revision: ModelRevision): void
  claimCompletion(interactionId: InteractionId): boolean
  resolveCommit(input: ResolvePianoRollSustainPedalCommitInput): void
  finish(interactionId: InteractionId): void
  subscribe(observer: PianoRollSustainPedalInteractionSessionObserver): () => void
}
