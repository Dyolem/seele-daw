import { type PlaybackLocateSession } from '@seele-daw/playback'
import type { EditorPointerInput, InteractionId } from '@seele-daw/editor'
import type { Tick } from '@seele-daw/project-core'

export type TimelineLocateInput = EditorPointerInput<never>
export interface TimelineLocateState {
  readonly interactionId: InteractionId | null
  readonly previewTick: Tick | null
}
export interface TimelineLocateConfiguration {
  readonly beginPlayback: () => PlaybackLocateSession | null
  readonly wasFollowSuspended: boolean
}
export interface TimelineLocateCompletion {
  readonly committed: boolean
  readonly accepted: boolean
  readonly startedWhilePlaying: boolean
  readonly wasFollowSuspended: boolean
}
