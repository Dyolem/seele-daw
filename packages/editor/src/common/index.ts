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
