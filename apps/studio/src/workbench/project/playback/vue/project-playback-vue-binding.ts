import { markRaw, shallowReadonly, shallowRef, type ShallowRef } from 'vue'

import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
  type ProjectPlaybackStateDeliveryFailure,
  type ProjectPlaybackUnsubscribe,
} from '@/workbench/project/playback/project-playback-state'
import type {
  ProjectPlaybackVisualFrameHandle,
  ProjectPlaybackVisualFramePort,
  ProjectPlaybackVisualPosition,
} from '@/workbench/project/playback/project-playback-visual-position'
import type { ProjectPlaybackVueContext } from '@/workbench/project/playback/vue/project-playback-context'

export interface ProjectPlaybackVueBinding {
  readonly context: ProjectPlaybackVueContext
  readonly stateDeliveryFailure: Readonly<ShallowRef<ProjectPlaybackStateDeliveryFailure | null>>
  dispose(): void
}

class ProjectPlaybackVueBindingImpl implements ProjectPlaybackVueBinding {
  readonly context: ProjectPlaybackVueContext
  readonly stateDeliveryFailure: Readonly<ShallowRef<ProjectPlaybackStateDeliveryFailure | null>>
  readonly #projectPlayback: ProjectPlaybackCoordinator
  readonly #state: ShallowRef<ProjectPlaybackState>
  readonly #stateDeliveryFailure: ShallowRef<ProjectPlaybackStateDeliveryFailure | null>
  readonly #unsubscribe: ProjectPlaybackUnsubscribe
  readonly #visualFrame: ProjectPlaybackVisualFramePort
  readonly #visualPosition: ShallowRef<ProjectPlaybackVisualPosition>
  #visualFrameHandle: ProjectPlaybackVisualFrameHandle | null = null
  #disposed = false

  constructor(
    projectPlaybackInput: ProjectPlaybackCoordinator,
    visualFrame: ProjectPlaybackVisualFramePort,
  ) {
    const projectPlayback = markRaw(projectPlaybackInput)
    this.#projectPlayback = projectPlayback
    this.#state = shallowRef(projectPlayback.state)
    this.#stateDeliveryFailure = shallowRef<ProjectPlaybackStateDeliveryFailure | null>(null)
    this.#visualFrame = visualFrame
    this.#visualPosition = shallowRef(projectPlayback.readVisualPosition())
    this.context = Object.freeze({
      projectPlayback,
      state: shallowReadonly(this.#state),
      visualPosition: shallowReadonly(this.#visualPosition),
    })
    this.stateDeliveryFailure = shallowReadonly(this.#stateDeliveryFailure)
    this.#unsubscribe = projectPlayback.subscribe({
      onError: (failure) => {
        this.#stateDeliveryFailure.value = failure
      },
      onStateChange: (state) => {
        this.#state.value = state
        this.#synchronizeVisualPosition()
      },
    })
    this.#requestVisualFrame()
  }

  #requestVisualFrame(): void {
    if (
      this.#disposed ||
      this.#visualFrameHandle !== null ||
      this.#visualPosition.value.phase !== PROJECT_PLAYBACK_PHASE.PLAYING
    ) {
      return
    }

    this.#visualFrameHandle = this.#visualFrame.request(() => {
      this.#visualFrameHandle = null
      if (this.#disposed) return
      this.#visualPosition.value = this.#projectPlayback.readVisualPosition()
      this.#requestVisualFrame()
    })
  }

  #stopVisualFrame(): void {
    const handle = this.#visualFrameHandle
    if (handle === null) return
    this.#visualFrame.cancel(handle)
    this.#visualFrameHandle = null
  }

  #synchronizeVisualPosition(): void {
    if (this.#state.value.phase !== PROJECT_PLAYBACK_PHASE.PLAYING) {
      this.#stopVisualFrame()
    }
    this.#visualPosition.value = this.#projectPlayback.readVisualPosition()
    this.#requestVisualFrame()
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#stopVisualFrame()
    this.#unsubscribe()
  }
}

/** Projects low-frequency state and frame-sampled position without proxying runtime resources. */
export function createProjectPlaybackVueBinding(
  projectPlayback: ProjectPlaybackCoordinator,
  visualFrame: ProjectPlaybackVisualFramePort,
): ProjectPlaybackVueBinding {
  return new ProjectPlaybackVueBindingImpl(projectPlayback, visualFrame)
}
