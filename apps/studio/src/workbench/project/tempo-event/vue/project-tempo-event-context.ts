import { PROJECT_TEMPO_EVENT_CONTEXT_KEY } from '@/symbols'
import { inject } from 'vue'
import type { ProjectTempoEventCoordinator } from '@/workbench/project/tempo-event/project-tempo-event-coordinator'
import { ProjectTempoEventError } from '@/workbench/project/tempo-event/project-tempo-event-error'

export interface ProjectTempoEventVueContext {
  readonly projectTempoEvents: ProjectTempoEventCoordinator
}

/** Resolves the Tempo Event command capability owned by the current Studio application. */
export function useProjectTempoEvents(): ProjectTempoEventVueContext {
  const context = inject(PROJECT_TEMPO_EVENT_CONTEXT_KEY, null)
  if (context === null) {
    throw new ProjectTempoEventError(
      'missing-context',
      'Project Tempo Event Vue Context has not been provided',
    )
  }
  return context
}
