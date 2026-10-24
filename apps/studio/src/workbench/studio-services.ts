import { inject, type InjectionKey } from 'vue'

import type { StudioActionRuntime } from '@/bootstrap/studio-action-runtime'
import type { ProjectEdits } from '@/workbench/edits/project-edits'
import type { ProjectEntryCoordinator } from '@/workbench/project/entry/project-entry-coordinator'
import type { ProjectMidiImportCoordinator } from '@/workbench/project/midi-import/project-midi-import-coordinator'
import type { ProjectNavigationDecisionVueContext } from '@/workbench/project/navigation/vue/project-navigation-decision-vue-binding'
import type { ProjectPlaybackVueContext } from '@/workbench/project/playback/vue/project-playback-vue-binding'
import type { ActiveProjectVueContext } from '@/workbench/project/vue/active-project-vue-binding'

/**
 * The application services a component may use, created and disposed by the composition root.
 * Reactive members are shallow projections; the services themselves stay outside Vue reactivity.
 */
export interface StudioServices {
  readonly actions: StudioActionRuntime
  readonly edits: ProjectEdits
  readonly midiImport: ProjectMidiImportCoordinator
  readonly navigation: ProjectNavigationDecisionVueContext
  readonly playback: ProjectPlaybackVueContext
  readonly project: ActiveProjectVueContext
  readonly projectEntry: ProjectEntryCoordinator
}

export const STUDIO_SERVICES_KEY: InjectionKey<StudioServices> = Symbol(
  'seele/studio/StudioServices',
)

export function useStudio(): StudioServices {
  const services = inject(STUDIO_SERVICES_KEY, null)
  if (services === null) throw new Error('Studio services have not been provided')
  return services
}
