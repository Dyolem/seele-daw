import { createApp } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectEntryCoordinator } from '@/workbench/project/entry/project-entry-coordinator'
import {
  PROJECT_ENTRY_CONTEXT_KEY,
  useProjectEntry,
  type ProjectEntryVueContext,
} from '@/workbench/project/entry/vue/project-entry-context'
import { ProjectEntryVueError } from '@/workbench/project/entry/vue/project-entry-vue-error'

describe('ProjectEntryVueContext', () => {
  it('provides one scoped Coordinator and reports a missing Provider explicitly', () => {
    const context = Object.freeze<ProjectEntryVueContext>({
      projectEntry: Object.freeze({ resolve: vi.fn<ProjectEntryCoordinator['resolve']>() }),
    })
    const providedApp = createApp({ render: () => null })
    providedApp.provide(PROJECT_ENTRY_CONTEXT_KEY, context)
    const missingApp = createApp({ render: () => null })

    expect(providedApp.runWithContext(() => useProjectEntry())).toBe(context)
    expect(() => missingApp.runWithContext(() => useProjectEntry())).toThrowError(
      expect.objectContaining({
        name: 'ProjectEntryVueError',
        code: 'missing-context',
      }),
    )
    expect(() => missingApp.runWithContext(() => useProjectEntry())).toThrow(ProjectEntryVueError)
  })
})
