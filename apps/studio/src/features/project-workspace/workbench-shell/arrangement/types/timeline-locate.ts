import type { EditorPointerInput, InteractionId } from '@seele-daw/editor'
import type { Tick } from '@seele-daw/project-core'
import type { ProjectPlaybackLocateSession } from '@/workbench/project/playback/project-playback-coordinator'

export type TimelineLocateInput = EditorPointerInput<never>
export interface TimelineLocateState {
  readonly interactionId: InteractionId | null
  readonly previewTick: Tick | null
}
export interface TimelineLocateConfiguration {
  readonly beginPlayback: () => ProjectPlaybackLocateSession | null
  readonly wasFollowSuspended: boolean
}
export interface TimelineLocateCompletion {
  readonly committed: boolean
  readonly accepted: boolean
  readonly startedWhilePlaying: boolean
  readonly wasFollowSuspended: boolean
}
