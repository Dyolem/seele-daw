import {
  STUDIO_ACTION_CANCELLED,
  STUDIO_ACTION_COMPLETED,
  createStudioActionPresentation,
  type StudioAction,
  type StudioActionCompletion,
  type StudioActionDescriptor,
  type StudioActionFailure,
  type StudioActionInvocation,
  type StudioActionPresentation,
  type StudioActionSource,
  type StudioActionState,
} from '@/workbench/actions/studio-action'
import type { StudioActionId } from '@/workbench/actions/studio-actions'
import type { StudioContextRegistry } from '@/workbench/actions/studio-context-registry'

export interface StudioActionCoordinator {
  readonly catalogue: readonly StudioActionDescriptor[]
  presentationFor(actionId: StudioActionId): StudioActionPresentation
  invoke(actionId: StudioActionId, source: StudioActionSource): StudioActionInvocation
  dispose(): void
}

export interface StudioActionCoordinatorOptions {
  readonly actions: readonly StudioAction[]
  readonly contexts: StudioContextRegistry
  readonly reportFailure: (failure: StudioActionFailure) => void
}

interface Resolution {
  readonly presentation: StudioActionPresentation
  readonly state: StudioActionState
  isCurrent(): boolean
  onInvalidated(listener: () => void): () => void
}

/** Owns invocation outcomes and lifetimes, never Project facts or business busy state. */
export function createStudioActionCoordinator(
  options: StudioActionCoordinatorOptions,
): StudioActionCoordinator {
  const { contexts } = options
  const actions = new Map<StudioActionId, StudioAction>()
  // Validate the whole set before making any action callable.
  for (const action of options.actions) {
    if (
      actions.has(action.id) ||
      action.label.trim().length === 0 ||
      action.description.trim().length === 0
    ) {
      throw new Error(`Invalid or duplicate Studio Action: ${action.id}`)
    }
    actions.set(action.id, action)
  }
  const catalogue = Object.freeze(
    [...actions.values()].map(
      ({ id, label, description, category, keywords, context, keys, repeat }) =>
        Object.freeze({ id, label, description, category, keywords, context, keys, repeat }),
    ),
  )
  const pending = new Set<() => void>()
  const presentationFailures = new Map<StudioActionId, unknown>()
  let disposed = false

  function report(failure: StudioActionFailure): void {
    try {
      options.reportFailure(failure)
    } catch (cause) {
      // A broken feedback sink must remain observable without escaping an input callback.
      console.error('Studio Action failure reporting failed', failure, cause)
    }
  }

  function failed(
    actionId: StudioActionId,
    source: StudioActionSource | null,
    operation: StudioActionFailure['operation'],
    cause: unknown,
  ): StudioActionFailure {
    const failure = Object.freeze({ actionId, source, operation, cause })
    report(failure)
    return failure
  }

  function resolve(action: StudioAction | undefined): Resolution | null {
    if (action === undefined) return null
    const binding = contexts.current(action.context)
    if (binding === null) return null
    const state = action.resolve(binding.target, contexts)
    if (state === null) return null
    let label = state.label ?? action.label
    if (state.detail) label += ` — ${state.detail}`
    return {
      presentation: createStudioActionPresentation(label, state.disabledReason ?? null, state),
      state,
      isCurrent: () => binding.isCurrent() && (state.isCurrent?.() ?? true),
      onInvalidated: binding.onInvalidated,
    }
  }

  function execute(
    actionId: StudioActionId,
    source: StudioActionSource,
    resolution: Resolution,
  ): StudioActionInvocation {
    let finish: (result: StudioActionCompletion) => void = () => undefined
    const completion = new Promise<StudioActionCompletion>((resolve) => {
      finish = resolve
    })
    let settled = false
    let releaseTarget: () => void = () => undefined
    const cancel = () => settle(STUDIO_ACTION_CANCELLED)

    function settle(result: StudioActionCompletion): void {
      if (settled) return
      settled = true
      pending.delete(cancel)
      try {
        releaseTarget()
      } catch (cause) {
        failed(actionId, source, 'execute', cause)
      }
      if (result.status === 'failed' && !result.reported) {
        failed(actionId, source, 'execute', result.cause)
        result = { ...result, reported: true }
      }
      finish(Object.freeze(result))
    }

    pending.add(cancel)
    try {
      releaseTarget = resolution.onInvalidated(cancel)
      if (settled) releaseTarget()
      if (!settled) {
        // Execute synchronously up to the first await, preserving browser user activation.
        const result = resolution.state.execute()
        void Promise.resolve(result).then(
          (outcome) => {
            if (settled) return
            try {
              settle(
                resolution.isCurrent()
                  ? (outcome ?? STUDIO_ACTION_COMPLETED)
                  : STUDIO_ACTION_CANCELLED,
              )
            } catch (cause) {
              settle({ status: 'failed', cause, reported: false })
            }
          },
          (cause: unknown) => settle({ status: 'failed', cause, reported: false }),
        )
      }
    } catch (cause) {
      settle({ status: 'failed', cause, reported: false })
    }
    return Object.freeze({ status: 'accepted', completion })
  }

  return {
    catalogue,
    presentationFor(actionId) {
      const label = actions.get(actionId)?.label ?? actionId
      if (disposed) return createStudioActionPresentation(label, 'The application has been closed.')
      try {
        const resolution = resolve(actions.get(actionId))
        const presentation =
          resolution !== null && resolution.isCurrent()
            ? resolution.presentation
            : createStudioActionPresentation(label, 'No active target is available.')
        presentationFailures.delete(actionId)
        return presentation
      } catch (cause) {
        if (!presentationFailures.has(actionId)) failed(actionId, null, 'presentation', cause)
        presentationFailures.set(actionId, cause)
        return createStudioActionPresentation(
          label,
          'The action is unavailable after an unexpected error.',
        )
      }
    },
    invoke(actionId, source) {
      if (disposed)
        return Object.freeze({ status: 'unavailable', reason: 'The application has been closed.' })
      let resolution: Resolution | null
      try {
        resolution = resolve(actions.get(actionId))
        if (resolution === null || !resolution.isCurrent()) {
          return Object.freeze({ status: 'unavailable', reason: 'No active target is available.' })
        }
        if (!resolution.presentation.enabled) {
          return Object.freeze({
            status: 'unavailable',
            reason: resolution.presentation.disabledReason ?? 'The action is disabled.',
          })
        }
      } catch (cause) {
        return Object.freeze({
          status: 'failed',
          failure: failed(actionId, source, 'resolve', cause),
        })
      }
      return execute(actionId, source, resolution)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const cancel of pending) cancel()
      actions.clear()
      presentationFailures.clear()
    },
  }
}
