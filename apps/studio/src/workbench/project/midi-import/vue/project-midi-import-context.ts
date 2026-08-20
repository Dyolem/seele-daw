import { inject, type InjectionKey } from 'vue'

import type { ProjectMidiImportCoordinator } from '@/workbench/project/midi-import/project-midi-import-coordinator'
import { ProjectMidiImportVueError } from '@/workbench/project/midi-import/vue/project-midi-import-vue-error'

export interface ProjectMidiImportVueContext {
  readonly projectMidiImport: ProjectMidiImportCoordinator
}

export const PROJECT_MIDI_IMPORT_CONTEXT_KEY: InjectionKey<ProjectMidiImportVueContext> = Symbol(
  'ProjectMidiImportVueContext',
)

/** Resolves the local MIDI import capability owned by the Studio application. */
export function useProjectMidiImport(): ProjectMidiImportVueContext {
  const context = inject(PROJECT_MIDI_IMPORT_CONTEXT_KEY, null)

  if (context === null) {
    throw new ProjectMidiImportVueError(
      'missing-context',
      'Project MIDI Import Vue Context has not been provided',
    )
  }

  return context
}
