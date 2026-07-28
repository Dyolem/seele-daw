import { inject, type InjectionKey } from 'vue'

import type { ProjectMidiNoteCoordinator } from '@/workbench/project/midi-note/project-midi-note-coordinator'
import { ProjectMidiNoteVueError } from '@/workbench/project/midi-note/vue/project-midi-note-vue-error'

export interface ProjectMidiNoteVueContext {
  readonly projectMidiNotes: ProjectMidiNoteCoordinator
}

export const PROJECT_MIDI_NOTE_CONTEXT_KEY: InjectionKey<ProjectMidiNoteVueContext> =
  Symbol('ProjectMidiNoteVueContext')

/** Resolves the MIDI Note command capability owned by the current Studio application. */
export function useProjectMidiNotes(): ProjectMidiNoteVueContext {
  const context = inject(PROJECT_MIDI_NOTE_CONTEXT_KEY, null)

  if (context === null) {
    throw new ProjectMidiNoteVueError(
      'missing-context',
      'Project MIDI Note Vue Context has not been provided',
    )
  }

  return context
}
