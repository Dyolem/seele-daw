import { TEMPO_EVENT_ACTION_CONTEXT_KEY } from '@/symbols'
import { inject } from 'vue'
import type { TempoEventActionContext } from './types/tempo-event-actions'

export function useTempoEventActions(): TempoEventActionContext {
  const context = inject(TEMPO_EVENT_ACTION_CONTEXT_KEY, null)
  if (context === null) throw new Error('Tempo Event Action Context has not been provided')
  return context
}
