import type {
  ClipId,
  MidiChannel,
  MidiSustainPedalEventId,
  ModelRevision,
  ProjectSession,
  TrackId,
} from '@seele-daw/project-core'
import type { GestureState } from '#internal/common/interaction/gesture-session'
import type { InteractionId } from '#internal/common/interaction/interaction-session'
import type { PianoRollValueLaneViewport } from '#internal/common/piano-roll/value-lane/piano-roll-value-lane-viewport'
import type { TimelineGrid } from '#internal/common/timeline-grid'
import type { PianoRollSustainPedalEditingScope } from './sustain-pedal-editing-scope'
import type { PianoRollSustainPedalPlacement } from './sustain-pedal-pencil-interaction'
import type {
  PianoRollSustainPedalMovePreview,
  PianoRollSustainPedalValuePreview,
  PianoRollSustainPedalTransformGesture,
  PianoRollSustainPedalTransformPreview,
} from './sustain-pedal-event-transform'

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

export type PianoRollSustainPedalInteractionState =
  GestureState<PianoRollSustainPedalTransformPreview>
