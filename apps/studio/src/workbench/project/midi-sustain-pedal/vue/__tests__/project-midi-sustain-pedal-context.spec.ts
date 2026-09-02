import {
  parseClipId,
  parseMidiChannel,
  parseMidiControlValue,
  parseTick,
  type ModelRevision,
} from '@seele-daw/project-core'
import { createApp } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectMidiSustainPedalCoordinator } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-coordinator'
import {
  PROJECT_MIDI_SUSTAIN_PEDAL_CONTEXT_KEY,
  useProjectMidiSustainPedal,
  type ProjectMidiSustainPedalVueContext,
} from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-context'
import { ProjectMidiSustainPedalVueError } from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-vue-error'

describe('ProjectMidiSustainPedalVueContext', () => {
  it('resolves the provided Coordinator and fails clearly without composition', () => {
    const placeInClip = vi.fn<ProjectMidiSustainPedalCoordinator['placeInClip']>()
    const placeOnTrack = vi.fn<ProjectMidiSustainPedalCoordinator['placeOnTrack']>()
    const moveEvents = vi.fn<ProjectMidiSustainPedalCoordinator['moveEvents']>()
    const removeEvents = vi.fn<ProjectMidiSustainPedalCoordinator['removeEvents']>()
    const replaceEventValue = vi.fn<ProjectMidiSustainPedalCoordinator['replaceEventValue']>()
    const context: ProjectMidiSustainPedalVueContext = Object.freeze({
      projectMidiSustainPedal: Object.freeze({
        moveEvents,
        placeInClip,
        placeOnTrack,
        removeEvents,
        replaceEventValue,
      }),
    })
    const providedApp = createApp({ render: () => null })
    const missingApp = createApp({ render: () => null })
    providedApp.provide(PROJECT_MIDI_SUSTAIN_PEDAL_CONTEXT_KEY, context)

    expect(providedApp.runWithContext(() => useProjectMidiSustainPedal())).toBe(context)
    expect(() => missingApp.runWithContext(() => useProjectMidiSustainPedal())).toThrowError(
      expect.objectContaining<Partial<ProjectMidiSustainPedalVueError>>({
        code: 'missing-context',
        name: 'ProjectMidiSustainPedalVueError',
      }),
    )

    providedApp.runWithContext(() =>
      useProjectMidiSustainPedal().projectMidiSustainPedal.placeInClip({
        baseRevision: 0 as ModelRevision,
        channel: parseMidiChannel(0),
        clipId: parseClipId('context-sustain-pedal-clip'),
        clipTick: parseTick(0),
        value: parseMidiControlValue(127),
      }),
    )
    expect(placeInClip).toHaveBeenCalledOnce()
  })
})
