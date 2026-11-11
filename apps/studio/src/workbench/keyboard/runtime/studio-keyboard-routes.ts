import type {
  StudioActionDescriptor,
  StudioContext,
  StudioActionId,
} from '@/workbench/actions/studio-action'
import type {
  StudioKeyboardBinding,
  StudioKeyboardKeymap,
} from '@/workbench/keyboard/contracts/studio-keyboard-binding'
import type { StudioKeyboardBindingRegistry } from '@/workbench/keyboard/contracts/studio-keyboard-binding-registry'
import type { StudioKeyboardRelation } from '@/workbench/keyboard/contracts/studio-keyboard-relation'

export interface StudioKeyboardRoute {
  readonly binding: StudioKeyboardBinding
  /** Highest context priority first. */
  readonly actions: readonly StudioActionDescriptor[]
}

/**
 * Same-priority contexts are mutually exclusive by focus unless declared to overlap; contexts at
 * different priorities can be active together and resolve a shared key by priority.
 */
function contextsOverlap(a: StudioContext, b: StudioContext): boolean {
  return (
    a === b ||
    a.priority !== b.priority ||
    (a.overlaps?.includes(b) ?? false) ||
    (b.overlaps?.includes(a) ?? false)
  )
}

export function analyzeStudioKeyboardRoutes(
  catalogue: readonly StudioActionDescriptor[],
  keymap: StudioKeyboardKeymap<StudioActionId>,
  registry: StudioKeyboardBindingRegistry,
) {
  const routes = new Map<
    string,
    { binding: StudioKeyboardBinding; actions: StudioActionDescriptor[] }
  >()
  const relations: StudioKeyboardRelation[] = []
  for (const action of catalogue) {
    for (const binding of keymap[action.id]) {
      const identity = registry.identity(binding)
      let route = routes.get(identity)
      if (!route) {
        route = { binding, actions: [] }
        routes.set(identity, route)
      }
      if (route.actions.includes(action)) continue
      for (const other of route.actions) {
        const difference = action.context.priority - other.context.priority
        let kind: StudioKeyboardRelation['kind'] = 'exclusive'
        if (contextsOverlap(other.context, action.context))
          kind = difference === 0 ? 'conflict' : 'priority'
        let priorityActionId: StudioActionId | null = null
        if (kind === 'priority') priorityActionId = difference > 0 ? action.id : other.id
        relations.push(
          Object.freeze({
            kind,
            priorityActionId,
            binding,
            actionIds: Object.freeze([other.id, action.id] as const),
          }),
        )
      }
      route.actions.push(action)
    }
  }
  for (const route of routes.values()) {
    route.actions.sort((a, b) => b.context.priority - a.context.priority)
  }
  return {
    routes: routes as ReadonlyMap<string, StudioKeyboardRoute>,
    relations: Object.freeze(relations),
    conflicts: Object.freeze(relations.filter((relation) => relation.kind === 'conflict')),
  }
}
