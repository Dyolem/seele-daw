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
export { TimelineGridError } from './timeline-grid-error'
export type { TimelineGridErrorCode } from './timeline-grid-error'

export { InteractionSession } from './interaction/interaction-session'
export type { InteractionId, InteractionOperation } from './interaction/interaction-session'
export { InteractionCommitHandoff } from './interaction/interaction-commit-handoff'
export { EDITOR_POINTER_INPUT_PHASE } from './interaction/editor-pointer-input'
export type { EditorPointerInput } from './interaction/editor-pointer-input'
