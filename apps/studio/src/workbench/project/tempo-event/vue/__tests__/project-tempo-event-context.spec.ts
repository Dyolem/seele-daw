import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectTempoEventCoordinator } from '@/workbench/project/tempo-event/project-tempo-event-coordinator'
import { ProjectTempoEventError } from '@/workbench/project/tempo-event/project-tempo-event-error'
import {
  PROJECT_TEMPO_EVENT_CONTEXT_KEY,
  useProjectTempoEvents,
  type ProjectTempoEventVueContext,
} from '@/workbench/project/tempo-event/vue/project-tempo-event-context'

describe('Project Tempo Event Vue Context', () => {
  it('provides the application-owned coordinator without wrapping it', () => {
    const projectTempoEvents: ProjectTempoEventCoordinator = Object.freeze({
      addTempoEvent: vi.fn<ProjectTempoEventCoordinator['addTempoEvent']>(),
      moveTempoEvent: vi.fn<ProjectTempoEventCoordinator['moveTempoEvent']>(),
      removeTempoEvent: vi.fn<ProjectTempoEventCoordinator['removeTempoEvent']>(),
      replaceTempoEventBpm: vi.fn<ProjectTempoEventCoordinator['replaceTempoEventBpm']>(),
    })
    const context: ProjectTempoEventVueContext = Object.freeze({ projectTempoEvents })
    let resolved: ProjectTempoEventVueContext | null = null
    const Consumer = defineComponent({
      setup() {
        resolved = useProjectTempoEvents()
        return () => h('div')
      },
    })

    mount(Consumer, {
      global: { provide: { [PROJECT_TEMPO_EVENT_CONTEXT_KEY as symbol]: context } },
    })
    expect(resolved).toBe(context)
  })

  it('fails clearly when the Composition Root omitted the capability', () => {
    const Consumer = defineComponent({
      setup() {
        useProjectTempoEvents()
        return () => h('div')
      },
    })

    expect(() => mount(Consumer)).toThrowError(ProjectTempoEventError)
  })
})
