import type { InjectionKey } from 'vue'
import type { TempoTrackPreviewController } from '@/features/project-workspace/tempo-track/types/tempo-track-preview'
import type { TempoEventActionContext } from '@/features/project-workspace/tempo-track/types/tempo-event-actions'
import type { StudioServices } from '@/workbench/studio-services'

/** The Studio symbol catalogue. Contexts and providers share these typed, module-local keys. */
export const STUDIO_SERVICES_KEY: InjectionKey<StudioServices> = Symbol(
  'seele/studio/StudioServices',
)

export const TEMPO_EVENT_ACTION_CONTEXT_KEY: InjectionKey<TempoEventActionContext> = Symbol(
  'seele/studio/TempoEventActionContext',
)

export const TEMPO_TRACK_PREVIEW_KEY: InjectionKey<TempoTrackPreviewController> = Symbol(
  'seele/studio/TempoTrackPreviewController',
)

/** Each keyboard claim must have an independent lifetime, including nested suspensions. */
export function createKeyboardInputOwner(): symbol {
  return Symbol('seele/studio/keyboard-input-owner')
}
