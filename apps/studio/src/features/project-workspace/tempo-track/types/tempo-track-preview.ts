import type { InteractionId } from '@seele-daw/editor'
import type { ShallowRef } from 'vue'
import type { TempoTrackEventPreview } from './tempo-track-drag'

/** Shared presentation only; the producing Session owns completion and cancellation. */
export interface TempoTrackPreviewController {
  readonly preview: Readonly<ShallowRef<TempoTrackEventPreview | null>>
  publishPreview(interactionId: InteractionId, preview: TempoTrackEventPreview): boolean
  cancelPreview(interactionId?: InteractionId): boolean
}
