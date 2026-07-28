/** Framework-agnostic editor contracts and interaction state belong here. */
export * from './piano-roll/index'
export {
  createTimelineGrid,
  resolveTimelineGridTick,
} from './timeline-grid'
export type {
  CreateTimelineGridInput,
  ResolveTimelineGridTickInput,
  TimelineGrid,
} from './timeline-grid'
export { TimelineGridError } from './timeline-grid-error'
export type { TimelineGridErrorCode } from './timeline-grid-error'
