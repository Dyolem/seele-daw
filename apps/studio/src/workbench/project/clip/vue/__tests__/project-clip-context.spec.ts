import { createApp } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectClipCoordinator } from '@/workbench/project/clip/project-clip-coordinator'
import {
  PROJECT_CLIP_CONTEXT_KEY,
  useProjectClips,
  type ProjectClipVueContext,
} from '@/workbench/project/clip/vue/project-clip-context'
import { ProjectClipVueError } from '@/workbench/project/clip/vue/project-clip-vue-error'

describe('ProjectClipVueContext', () => {
  it('resolves the provided Coordinator and fails clearly without composition', () => {
    const context: ProjectClipVueContext = Object.freeze({
      projectClips: Object.freeze({
        addEmptyMidiClip: vi.fn<ProjectClipCoordinator['addEmptyMidiClip']>(),
      }),
    })
    const providedApp = createApp({ render: () => null })
    const missingApp = createApp({ render: () => null })

    providedApp.provide(PROJECT_CLIP_CONTEXT_KEY, context)

    expect(providedApp.runWithContext(() => useProjectClips())).toBe(context)
    expect(() => missingApp.runWithContext(() => useProjectClips())).toThrowError(
      expect.objectContaining<Partial<ProjectClipVueError>>({
        name: 'ProjectClipVueError',
        code: 'missing-context',
      }),
    )
    expect(() => missingApp.runWithContext(() => useProjectClips())).toThrow(ProjectClipVueError)
  })
})
