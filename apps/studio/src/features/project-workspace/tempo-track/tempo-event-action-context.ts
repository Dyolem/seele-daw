import type { TempoEventId } from '@seele-daw/project-core'
import { inject, type InjectionKey } from 'vue'
import type { StudioActionCompletion } from '@/workbench/actions/studio-action'

/** The Page owns playback preparation, the command result and selection cleanup. */
export interface TempoEventActionContext {
  removeTempoEvent(tempoEventId: TempoEventId): StudioActionCompletion
}
export const TEMPO_EVENT_ACTION_CONTEXT_KEY: InjectionKey<TempoEventActionContext> =
  Symbol('TempoEventActionContext')

export function useTempoEventActions(): TempoEventActionContext {
  const context = inject(TEMPO_EVENT_ACTION_CONTEXT_KEY, null)
  if (context === null) throw new Error('Tempo Event Action Context has not been provided')
  return context
}
