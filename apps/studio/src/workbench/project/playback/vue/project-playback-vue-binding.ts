import { markRaw, shallowReadonly, shallowRef, type ShallowRef } from 'vue'

import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import type {
  ProjectPlaybackState,
  ProjectPlaybackStateDeliveryFailure,
  ProjectPlaybackUnsubscribe,
} from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackVueContext } from '@/workbench/project/playback/vue/project-playback-context'

export interface ProjectPlaybackVueBinding {
  readonly context: ProjectPlaybackVueContext
  readonly stateDeliveryFailure: Readonly<ShallowRef<ProjectPlaybackStateDeliveryFailure | null>>
  dispose(): void
}

class ProjectPlaybackVueBindingImpl implements ProjectPlaybackVueBinding {
  readonly context: ProjectPlaybackVueContext
  readonly stateDeliveryFailure: Readonly<ShallowRef<ProjectPlaybackStateDeliveryFailure | null>>
  readonly #state: ShallowRef<ProjectPlaybackState>
  readonly #stateDeliveryFailure: ShallowRef<ProjectPlaybackStateDeliveryFailure | null>
  readonly #unsubscribe: ProjectPlaybackUnsubscribe
  #disposed = false

  constructor(projectPlaybackInput: ProjectPlaybackCoordinator) {
    const projectPlayback = markRaw(projectPlaybackInput)
    this.#state = shallowRef(projectPlayback.state)
    this.#stateDeliveryFailure = shallowRef<ProjectPlaybackStateDeliveryFailure | null>(null)
    this.context = Object.freeze({
      projectPlayback,
      state: shallowReadonly(this.#state),
    })
    this.stateDeliveryFailure = shallowReadonly(this.#stateDeliveryFailure)
    this.#unsubscribe = projectPlayback.subscribe({
      onError: (failure) => {
        this.#stateDeliveryFailure.value = failure
      },
      onStateChange: (state) => {
        this.#state.value = state
      },
    })
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#unsubscribe()
  }
}

/** Projects low-frequency playback state into Vue without proxying runtime resources. */
export function createProjectPlaybackVueBinding(
  projectPlayback: ProjectPlaybackCoordinator,
): ProjectPlaybackVueBinding {
  return new ProjectPlaybackVueBindingImpl(projectPlayback)
}
