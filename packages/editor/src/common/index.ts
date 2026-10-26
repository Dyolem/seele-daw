/** Framework-agnostic editor contracts and interaction state belong here. */
export * from './piano-roll/index'
export {
  TIMELINE_GRID_SNAP_MODE,
  createTimelineGrid,
  resolveTimelineGridTick,
} from './timeline-grid'
export type {
  CreateTimelineGridInput,
  ResolveTimelineGridTickInput,
  TimelineGrid,
  TimelineGridSnapMode,
} from './timeline-grid'

export { InteractionSession } from './interaction/interaction-session'
export type { InteractionId, InteractionOperation } from './interaction/interaction-session'
export { GestureSession, completeGesture } from './interaction/gesture-session'
export type {
  GestureAuthority,
  GestureCompletion,
  GestureIntent,
  GestureOutcome,
  GesturePointerInput,
  GestureStart,
  GestureState,
  ResolveGestureCommitInput,
} from './interaction/gesture-session'
export { projectGestureAuthority } from './project-gesture-authority'
export { INTERACTION_MODIFIER_RULES } from './interaction/interaction-modifiers'
export { EDITOR_POINTER_INPUT_PHASE } from './interaction/editor-pointer-input'
export type { EditorPointerInput } from './interaction/editor-pointer-input'
