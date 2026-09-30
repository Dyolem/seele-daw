import { TEMPO_TRACK_PREVIEW_KEY } from '@/symbols'
import type { InteractionId } from '@seele-daw/editor'
import { inject, provide, shallowRef } from 'vue'
import type { TempoTrackEventPreview } from './types/tempo-track-drag'
import type { TempoTrackPreviewController } from './types/tempo-track-preview'

/** Shares the Lane's transient projection with Arrangement controls, keyed by interaction identity. */
export function createTempoTrackPreviewController(): TempoTrackPreviewController {
  const preview = shallowRef<TempoTrackEventPreview | null>(null)
  let owner: InteractionId | null = null
  return Object.freeze({
    preview,
    publishPreview(interactionId: InteractionId, next: TempoTrackEventPreview): boolean {
      if (owner !== null && owner !== interactionId) return false
      owner = interactionId
      preview.value = Object.freeze({
        bpm: next.bpm,
        tempoEventId: next.tempoEventId,
        tick: next.tick,
      })
      return true
    },
    cancelPreview(interactionId?: InteractionId): boolean {
      if (owner === null || (interactionId !== undefined && owner !== interactionId)) return false
      owner = null
      preview.value = null
      return true
    },
  })
}

export function provideTempoTrackPreview(): TempoTrackPreviewController {
  const controller = createTempoTrackPreviewController()
  provide(TEMPO_TRACK_PREVIEW_KEY, controller)
  return controller
}

export function useTempoTrackPreview(): TempoTrackPreviewController {
  const controller = inject(TEMPO_TRACK_PREVIEW_KEY, null)
  if (controller === null) {
    throw new Error('Tempo Track preview has not been provided')
  }
  return controller
}
