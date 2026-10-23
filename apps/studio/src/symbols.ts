import type { InjectionKey } from 'vue'
import type { TempoEditing } from '@/features/project-workspace/tempo-track/tempo-editing'
import type { StudioServices } from '@/workbench/studio-services'

/** The Studio symbol catalogue. Contexts and providers share these typed, module-local keys. */
export const STUDIO_SERVICES_KEY: InjectionKey<StudioServices> = Symbol(
  'seele/studio/StudioServices',
)

export const TEMPO_EDITING_KEY: InjectionKey<TempoEditing> = Symbol('seele/studio/TempoEditing')

/** Each keyboard claim must have an independent lifetime, including nested suspensions. */
export function createKeyboardInputOwner(): symbol {
  return Symbol('seele/studio/keyboard-input-owner')
}
