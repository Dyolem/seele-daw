import { createApp, isProxy, isReadonly, isShallow } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
  type ProjectPlaybackStateDeliveryFailure,
  type ProjectPlaybackStateObserver,
} from '@/workbench/project/playback/project-playback-state'
import type {
  ProjectPlaybackVisualFrameHandle,
  ProjectPlaybackVisualFramePort,
  ProjectPlaybackVisualPosition,
} from '@/workbench/project/playback/project-playback-visual-position'
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
const INITIAL_VISUAL_POSITION = Object.freeze<ProjectPlaybackVisualPosition>({
  modelRevision: null,
  phase: PROJECT_PLAYBACK_PHASE.UNAVAILABLE,
  positionProjectSecond: 0,
  positionTick: 0 as ProjectPlaybackVisualPosition['positionTick'],
  projectId: null,
})

class ManualProjectPlaybackVisualFrame implements ProjectPlaybackVisualFramePort {
  readonly callbacks = new Map<ProjectPlaybackVisualFrameHandle, () => void>()
  readonly canceled: ProjectPlaybackVisualFrameHandle[] = []
  #sequence = 0

  cancel(handle: ProjectPlaybackVisualFrameHandle): void {
    if (this.callbacks.delete(handle)) this.canceled.push(handle)
  }

  fire(): void {
    const callbacks = [...this.callbacks.values()]
    this.callbacks.clear()
    for (const callback of callbacks) callback()
  }

  request(callback: () => void): ProjectPlaybackVisualFrameHandle {
    const handle = Object.freeze({ sequence: this.#sequence++ })
    this.callbacks.set(handle, callback)
    return handle
  }
}

function createCoordinatorFixture() {
  let observer: ProjectPlaybackStateObserver | null = null
  let visualPosition = INITIAL_VISUAL_POSITION
  const unsubscribe = vi.fn<() => void>()
  const readVisualPosition = vi.fn<() => ProjectPlaybackVisualPosition>(() => visualPosition)
  const coordinator: ProjectPlaybackCoordinator = Object.freeze({
    state: INITIAL_STATE,
    pause: () => false,
    play: async () => false,
    readVisualPosition,
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
    readVisualPosition,
    setVisualPosition(position: ProjectPlaybackVisualPosition) {
      visualPosition = position
    },
    unsubscribe,
  }
}

describe('ProjectPlaybackVueBinding', () => {
  it('projects low-frequency state and samples one authoritative visual position per frame', () => {
    const fixture = createCoordinatorFixture()
    const visualFrame = new ManualProjectPlaybackVisualFrame()
    const binding = createProjectPlaybackVueBinding(fixture.coordinator, visualFrame)
    const playing = Object.freeze<ProjectPlaybackState>({
      ...INITIAL_STATE,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
    })
    const playingPosition = Object.freeze<ProjectPlaybackVisualPosition>({
      ...INITIAL_VISUAL_POSITION,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
    })

    expect(binding.context.state.value).toBe(INITIAL_STATE)
    expect(binding.context.visualPosition.value).toBe(INITIAL_VISUAL_POSITION)
    expect(isShallow(binding.context.state)).toBe(true)
    expect(isReadonly(binding.context.state)).toBe(true)
    expect(isShallow(binding.context.visualPosition)).toBe(true)
    expect(isReadonly(binding.context.visualPosition)).toBe(true)
    expect(isProxy(binding.context.projectPlayback)).toBe(false)
    fixture.setVisualPosition(playingPosition)
    fixture.publish(playing)
    expect(binding.context.state.value).toBe(playing)
    expect(binding.context.visualPosition.value).toBe(playingPosition)
    expect(visualFrame.callbacks.size).toBe(1)

    const resumedPosition = Object.freeze<ProjectPlaybackVisualPosition>({
      ...playingPosition,
      positionProjectSecond: 12.25,
      positionTick: 23_520 as ProjectPlaybackVisualPosition['positionTick'],
    })
    fixture.setVisualPosition(resumedPosition)
    expect(binding.context.visualPosition.value).toBe(playingPosition)

    visualFrame.fire()

    expect(binding.context.visualPosition.value).toBe(resumedPosition)
    expect(visualFrame.callbacks.size).toBe(1)

    const app = createApp({ render: () => null })
    app.provide(PROJECT_PLAYBACK_CONTEXT_KEY, binding.context)
    expect(app.runWithContext(() => useProjectPlayback())).toBe(binding.context)
    const missingApp = createApp({ render: () => null })
    expect(() => missingApp.runWithContext(() => useProjectPlayback())).toThrowError(
      expect.objectContaining({ code: 'missing-context', name: 'ProjectPlaybackError' }),
    )

    binding.dispose()
    binding.dispose()
    expect(visualFrame.callbacks.size).toBe(0)
    expect(visualFrame.canceled).toHaveLength(1)
    expect(fixture.unsubscribe).toHaveBeenCalledOnce()
  })

  it('samples Pause, Return and project replacement immediately without retaining a frame', () => {
    const fixture = createCoordinatorFixture()
    const visualFrame = new ManualProjectPlaybackVisualFrame()
    const binding = createProjectPlaybackVueBinding(fixture.coordinator, visualFrame)
    const playing = Object.freeze<ProjectPlaybackState>({
      ...INITIAL_STATE,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
    })
    fixture.setVisualPosition(
      Object.freeze({
        ...INITIAL_VISUAL_POSITION,
        phase: PROJECT_PLAYBACK_PHASE.PLAYING,
        positionProjectSecond: 1,
        positionTick: 1_920 as ProjectPlaybackVisualPosition['positionTick'],
      }),
    )
    fixture.publish(playing)
    expect(visualFrame.callbacks.size).toBe(1)

    const pausedPosition = Object.freeze<ProjectPlaybackVisualPosition>({
      ...INITIAL_VISUAL_POSITION,
      phase: PROJECT_PLAYBACK_PHASE.PAUSED,
      positionProjectSecond: 1.5,
      positionTick: 2_880 as ProjectPlaybackVisualPosition['positionTick'],
    })
    fixture.setVisualPosition(pausedPosition)
    fixture.publish(
      Object.freeze({
        ...playing,
        phase: PROJECT_PLAYBACK_PHASE.PAUSED,
        positionProjectSecond: 1.5,
      }),
    )

    expect(binding.context.visualPosition.value).toBe(pausedPosition)
    expect(visualFrame.callbacks.size).toBe(0)

    const returnedPosition = Object.freeze<ProjectPlaybackVisualPosition>({
      ...INITIAL_VISUAL_POSITION,
      phase: PROJECT_PLAYBACK_PHASE.STOPPED,
    })
    fixture.setVisualPosition(returnedPosition)
    fixture.publish(
      Object.freeze({
        ...INITIAL_STATE,
        phase: PROJECT_PLAYBACK_PHASE.STOPPED,
      }),
    )
    expect(binding.context.visualPosition.value).toBe(returnedPosition)

    fixture.setVisualPosition(INITIAL_VISUAL_POSITION)
    fixture.publish(INITIAL_STATE)
    expect(binding.context.visualPosition.value).toBe(INITIAL_VISUAL_POSITION)
    expect(visualFrame.callbacks.size).toBe(0)
    binding.dispose()
  })

  it('resumes after background frame throttling at the latest authoritative position', () => {
    const fixture = createCoordinatorFixture()
    const visualFrame = new ManualProjectPlaybackVisualFrame()
    const binding = createProjectPlaybackVueBinding(fixture.coordinator, visualFrame)
    const playingState = Object.freeze<ProjectPlaybackState>({
      ...INITIAL_STATE,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
    })
    const firstVisiblePosition = Object.freeze<ProjectPlaybackVisualPosition>({
      ...INITIAL_VISUAL_POSITION,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
      positionProjectSecond: 0.25,
      positionTick: 480 as ProjectPlaybackVisualPosition['positionTick'],
    })
    fixture.setVisualPosition(firstVisiblePosition)
    fixture.publish(playingState)

    const latestBackgroundPosition = Object.freeze<ProjectPlaybackVisualPosition>({
      ...firstVisiblePosition,
      positionProjectSecond: 87.5,
      positionTick: 168_000 as ProjectPlaybackVisualPosition['positionTick'],
    })
    fixture.setVisualPosition(
      Object.freeze({
        ...firstVisiblePosition,
        positionProjectSecond: 32,
        positionTick: 61_440 as ProjectPlaybackVisualPosition['positionTick'],
      }),
    )
    fixture.setVisualPosition(latestBackgroundPosition)

    // A hidden page may receive no animation frames; the binding must not invent elapsed time.
    expect(binding.context.visualPosition.value).toBe(firstVisiblePosition)
    expect(visualFrame.callbacks.size).toBe(1)

    visualFrame.fire()

    expect(binding.context.visualPosition.value).toBe(latestBackgroundPosition)
    expect(visualFrame.callbacks.size).toBe(1)
    binding.dispose()
  })

  it('exposes observer delivery failures without replacing playback state', () => {
    const fixture = createCoordinatorFixture()
    const binding = createProjectPlaybackVueBinding(
      fixture.coordinator,
      new ManualProjectPlaybackVisualFrame(),
    )
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
