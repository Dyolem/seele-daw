import {
  STUDIO_ACTION,
  STUDIO_ACTION_CANCELLED,
  createStudioActionPresentation,
  type StudioActionCompletion,
  type StudioActionDefinition,
  type StudioActionDescriptor,
  type StudioActionFailure,
  type StudioActionId,
  type StudioActionInvocation,
  type StudioActionPresentation,
  type StudioActionResolution,
  type StudioActionSource,
} from '@/workbench/actions/studio-action'

export interface StudioActionCoordinator {
  readonly catalogue: readonly StudioActionDescriptor[]
  presentationFor(actionId: StudioActionId): StudioActionPresentation
  invoke(actionId: StudioActionId, source: StudioActionSource): StudioActionInvocation
  dispose(): void
}

export interface StudioActionCoordinatorOptions {
  readonly definitions: readonly StudioActionDefinition[]
  readonly reportFailure: (failure: StudioActionFailure) => void
}

/** Owns invocation outcomes and lifetimes, never Project facts or business busy state. */
export function createStudioActionCoordinator(
  options: StudioActionCoordinatorOptions,
): StudioActionCoordinator {
  const definitions = new Map<StudioActionId, StudioActionDefinition>()
  const knownIds = new Set<string>(Object.values(STUDIO_ACTION))
  // Validate the whole contribution set before making any definition callable.
  for (const definition of options.definitions) {
    if (
      !knownIds.has(definition.actionId) ||
      definitions.has(definition.actionId) ||
      definition.label.trim().length === 0 ||
      definition.description.trim().length === 0
    ) {
      throw new Error(`Invalid or duplicate Studio Action: ${definition.actionId}`)
    }
    definitions.set(definition.actionId, Object.freeze({ ...definition }))
  }
  const catalogue = Object.freeze(
    [...definitions.values()].map(({ actionId, description, label }) =>
      Object.freeze({ actionId, description, label }),
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

  function execute(
    actionId: StudioActionId,
    source: StudioActionSource,
    resolution: StudioActionResolution,
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
        const result = resolution.execute()
        void Promise.resolve(result).then(
          (outcome) => {
            if (settled) return
            try {
              settle(resolution.isCurrent() ? outcome : STUDIO_ACTION_CANCELLED)
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
      const definition = definitions.get(actionId)
      const label = definition?.label ?? actionId
      if (disposed) return createStudioActionPresentation(label, 'The application has been closed.')
      try {
        const resolution = definition?.resolve() ?? null
        const presentation =
          resolution !== null && resolution.isCurrent()
            ? Object.freeze({ ...resolution.presentation })
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
      let resolution: StudioActionResolution | null
      try {
        resolution = definitions.get(actionId)?.resolve() ?? null
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
      definitions.clear()
      presentationFailures.clear()
    },
  }
}
