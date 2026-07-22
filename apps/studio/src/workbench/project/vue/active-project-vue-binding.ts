import { markRaw, shallowReadonly, shallowRef, type ShallowRef } from 'vue'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import type {
  ActiveProjectState,
  ActiveProjectStateDeliveryFailure,
  ActiveProjectUnsubscribe,
} from '@/workbench/project/active-project-state'
import type { ActiveProjectVueContext } from '@/workbench/project/vue/active-project-context'

export interface ActiveProjectVueBinding {
  readonly context: ActiveProjectVueContext
  readonly stateDeliveryFailure: Readonly<ShallowRef<ActiveProjectStateDeliveryFailure | null>>
  dispose(): void
}

class ActiveProjectVueBindingImpl implements ActiveProjectVueBinding {
  readonly context: ActiveProjectVueContext
  readonly stateDeliveryFailure: Readonly<ShallowRef<ActiveProjectStateDeliveryFailure | null>>
  readonly #state: ShallowRef<ActiveProjectState>
  readonly #stateDeliveryFailure: ShallowRef<ActiveProjectStateDeliveryFailure | null>
  readonly #unsubscribe: ActiveProjectUnsubscribe
  #disposed = false

  constructor(activeProjectInput: ActiveProjectService) {
    const activeProject = markRaw(activeProjectInput)
    this.#state = shallowRef(activeProject.state)
    this.#stateDeliveryFailure = shallowRef<ActiveProjectStateDeliveryFailure | null>(null)
    this.context = Object.freeze({
      activeProject,
      state: shallowReadonly(this.#state),
    })
    this.stateDeliveryFailure = shallowReadonly(this.#stateDeliveryFailure)
    this.#unsubscribe = activeProject.subscribe({
      onStateChange: (state) => {
        this.#state.value = state
      },
      onError: (failure) => {
        this.#stateDeliveryFailure.value = failure
      },
    })
  }

  dispose(): void {
    if (this.#disposed) return

    this.#disposed = true
    this.#unsubscribe()
  }
}

/** Observes low-frequency Active Project lifecycle state without proxying the Session graph. */
export function createActiveProjectVueBinding(
  activeProject: ActiveProjectService,
): ActiveProjectVueBinding {
  return new ActiveProjectVueBindingImpl(activeProject)
}
