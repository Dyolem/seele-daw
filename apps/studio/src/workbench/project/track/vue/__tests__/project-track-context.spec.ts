import { createApp } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import {
  PROJECT_TRACK_CONTEXT_KEY,
  useProjectTracks,
  type ProjectTrackVueContext,
} from '@/workbench/project/track/vue/project-track-context'
import { ProjectTrackVueError } from '@/workbench/project/track/vue/project-track-vue-error'

describe('ProjectTrackVueContext', () => {
  it('provides one scoped Coordinator and reports a missing Provider explicitly', () => {
    const context: ProjectTrackVueContext = {
      projectTracks: Object.freeze({
        addInstrumentTrack: vi.fn<ProjectTrackCoordinator['addInstrumentTrack']>(),
        selectBuiltInInstrument: vi.fn<ProjectTrackCoordinator['selectBuiltInInstrument']>(),
      }),
    }
    const providedApp = createApp({ render: () => null })
    const missingApp = createApp({ render: () => null })

    providedApp.provide(PROJECT_TRACK_CONTEXT_KEY, context)

    expect(providedApp.runWithContext(() => useProjectTracks())).toBe(context)
    expect(() => missingApp.runWithContext(() => useProjectTracks())).toThrowError(
      expect.objectContaining({
        name: 'ProjectTrackVueError',
        code: 'missing-context',
      }),
    )
    expect(() => missingApp.runWithContext(() => useProjectTracks())).toThrow(ProjectTrackVueError)
  })
})
