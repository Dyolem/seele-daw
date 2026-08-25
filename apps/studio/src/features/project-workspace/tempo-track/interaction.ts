import type { TempoBpm, TempoEventId, Tick } from '@seele-daw/project-core'
import { inject, provide, shallowRef, type InjectionKey, type ShallowRef } from 'vue'

export type TempoTrackPreviewOwner = 'bpm-editor' | 'lane-drag' | 'position-editor'

export interface TempoTrackEventPreview {
  readonly bpm: TempoBpm
  readonly owner: TempoTrackPreviewOwner
  readonly tempoEventId: TempoEventId
  readonly tick: Tick
}

export interface TempoTrackInteractionController {
  readonly preview: Readonly<ShallowRef<TempoTrackEventPreview | null>>
  beginPreview(preview: TempoTrackEventPreview): boolean
  cancelPreview(owner?: TempoTrackPreviewOwner, tempoEventId?: TempoEventId): boolean
  finishPreview(
    owner: TempoTrackPreviewOwner,
    tempoEventId: TempoEventId,
  ): TempoTrackEventPreview | null
  updatePreview(preview: TempoTrackEventPreview): boolean
}

export const TEMPO_TRACK_INTERACTION_KEY: InjectionKey<TempoTrackInteractionController> = Symbol(
  'TempoTrackInteractionController',
)

/**
 * Coordinates one feature-scoped Tempo interaction without turning its preview into a Project fact.
 * The Arrangement owns this controller, descendants share its presentation, and only a completed
 * gesture is translated into a command by the Arrangement's existing event boundary.
 */
export function createTempoTrackInteractionController(): TempoTrackInteractionController {
  const preview = shallowRef<TempoTrackEventPreview | null>(null)

  function matches(owner: TempoTrackPreviewOwner, tempoEventId: TempoEventId): boolean {
    return preview.value?.owner === owner && preview.value.tempoEventId === tempoEventId
  }

  return Object.freeze({
    preview,
    beginPreview(nextPreview: TempoTrackEventPreview): boolean {
      if (preview.value !== null) return false
      preview.value = Object.freeze({ ...nextPreview })
      return true
    },
    cancelPreview(owner?: TempoTrackPreviewOwner, tempoEventId?: TempoEventId): boolean {
      if (
        preview.value === null ||
        (owner !== undefined && preview.value.owner !== owner) ||
        (tempoEventId !== undefined && preview.value.tempoEventId !== tempoEventId)
      ) {
        return false
      }
      preview.value = null
      return true
    },
    finishPreview(
      owner: TempoTrackPreviewOwner,
      tempoEventId: TempoEventId,
    ): TempoTrackEventPreview | null {
      if (!matches(owner, tempoEventId)) return null
      const completedPreview = preview.value
      preview.value = null
      return completedPreview
    },
    updatePreview(nextPreview: TempoTrackEventPreview): boolean {
      if (!matches(nextPreview.owner, nextPreview.tempoEventId)) return false
      preview.value = Object.freeze({ ...nextPreview })
      return true
    },
  })
}

export function provideTempoTrackInteraction(): TempoTrackInteractionController {
  const controller = createTempoTrackInteractionController()
  provide(TEMPO_TRACK_INTERACTION_KEY, controller)
  return controller
}

export function useTempoTrackInteraction(): TempoTrackInteractionController {
  const controller = inject(TEMPO_TRACK_INTERACTION_KEY, null)
  if (controller === null) {
    throw new Error('Tempo Track interaction has not been provided')
  }
  return controller
}
