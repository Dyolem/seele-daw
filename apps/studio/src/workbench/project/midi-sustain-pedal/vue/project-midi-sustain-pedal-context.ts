import { inject, type InjectionKey } from 'vue'

import type { ProjectMidiSustainPedalCoordinator } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-coordinator'
import { ProjectMidiSustainPedalVueError } from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-vue-error'

export interface ProjectMidiSustainPedalVueContext {
  readonly projectMidiSustainPedal: ProjectMidiSustainPedalCoordinator
}

export const PROJECT_MIDI_SUSTAIN_PEDAL_CONTEXT_KEY: InjectionKey<ProjectMidiSustainPedalVueContext> =
  Symbol('ProjectMidiSustainPedalVueContext')

/** Resolves the CC64 command capability owned by the current Studio application. */
export function useProjectMidiSustainPedal(): ProjectMidiSustainPedalVueContext {
  const context = inject(PROJECT_MIDI_SUSTAIN_PEDAL_CONTEXT_KEY, null)
  if (context === null) {
    throw new ProjectMidiSustainPedalVueError(
      'missing-context',
      'Project MIDI Sustain Pedal Vue Context has not been provided',
    )
  }
  return context
}
