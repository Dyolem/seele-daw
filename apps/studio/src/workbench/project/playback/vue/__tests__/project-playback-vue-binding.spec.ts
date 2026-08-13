import { createApp, isProxy, isReadonly, isShallow } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
  type ProjectPlaybackStateDeliveryFailure,
  type ProjectPlaybackStateObserver,
} from '@/workbench/project/playback/project-playback-state'
import {
  PROJECT_PLAYBACK_CONTEXT_KEY,
  useProjectPlayback,
} from '@/workbench/project/playback/vue/project-playback-context'
import { createProjectPlaybackVueBinding } from '@/workbench/project/playback/vue/project-playback-vue-binding'

const INITIAL_STATE = Object.freeze<ProjectPlaybackState>({
  diagnostics: Object.freeze([]),
  failureCause: null,
  feedback: null,
  modelRevision: null,
  phase: PROJECT_PLAYBACK_PHASE.UNAVAILABLE,
  planStatus: null,
  positionProjectSecond: 0,
  projectId: null,
})

function createCoordinatorFixture() {
  let observer: ProjectPlaybackStateObserver | null = null
  const unsubscribe = vi.fn<() => void>()
  const coordinator: ProjectPlaybackCoordinator = Object.freeze({
    state: INITIAL_STATE,
    pause: () => false,
    play: async () => false,
    returnToStart: () => false,
    subscribe(input: ProjectPlaybackStateObserver) {
      observer = input
      return unsubscribe
    },
    togglePlayPause: () => false,
    dispose() {},
  })
  return {
    coordinator,
    publish(state: ProjectPlaybackState) {
      if (observer === null) throw new Error('Expected the playback observer')
      observer.onStateChange(state)
    },
    publishFailure(failure: ProjectPlaybackStateDeliveryFailure) {
      if (observer === null) throw new Error('Expected the playback observer')
      observer.onError(failure)
    },
    unsubscribe,
  }
}

describe('ProjectPlaybackVueBinding', () => {
  it('projects frozen runtime state through a shallow readonly Context', () => {
    const fixture = createCoordinatorFixture()
    const binding = createProjectPlaybackVueBinding(fixture.coordinator)
    const playing = Object.freeze<ProjectPlaybackState>({
      ...INITIAL_STATE,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
      positionProjectSecond: 0.5,
    })

    expect(binding.context.state.value).toBe(INITIAL_STATE)
    expect(isShallow(binding.context.state)).toBe(true)
    expect(isReadonly(binding.context.state)).toBe(true)
    expect(isProxy(binding.context.projectPlayback)).toBe(false)
    fixture.publish(playing)
    expect(binding.context.state.value).toBe(playing)

    const app = createApp({ render: () => null })
    app.provide(PROJECT_PLAYBACK_CONTEXT_KEY, binding.context)
    expect(app.runWithContext(() => useProjectPlayback())).toBe(binding.context)
    const missingApp = createApp({ render: () => null })
    expect(() => missingApp.runWithContext(() => useProjectPlayback())).toThrowError(
      expect.objectContaining({ code: 'missing-context', name: 'ProjectPlaybackError' }),
    )

    binding.dispose()
    binding.dispose()
    expect(fixture.unsubscribe).toHaveBeenCalledOnce()
  })

  it('exposes observer delivery failures without replacing playback state', () => {
    const fixture = createCoordinatorFixture()
    const binding = createProjectPlaybackVueBinding(fixture.coordinator)
    const failure = Object.freeze<ProjectPlaybackStateDeliveryFailure>({
      cause: new Error('Playback state delivery failed'),
      state: INITIAL_STATE,
    })

    fixture.publishFailure(failure)

    expect(binding.stateDeliveryFailure.value).toBe(failure)
    expect(isShallow(binding.stateDeliveryFailure)).toBe(true)
    expect(isReadonly(binding.stateDeliveryFailure)).toBe(true)
    expect(binding.context.state.value).toBe(INITIAL_STATE)
    binding.dispose()
  })
})
