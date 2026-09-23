import type { StudioActionDescriptor, StudioActionId } from '@/workbench/actions/studio-action'
import { STUDIO_SHORTCUT_POLICIES } from '@/workbench/keyboard/studio-default-keymap'
import type {
  StudioKeyboardBinding,
  StudioKeyboardKeymap,
} from '@/workbench/keyboard/studio-keyboard-binding'
import type { StudioKeyboardBindingRegistry } from '@/workbench/keyboard/studio-keyboard-binding-registry'
import {
  STUDIO_KEYBOARD_CONTEXTS,
  studioKeyboardContextsOverlap,
} from '@/workbench/keyboard/studio-keyboard-context'

export interface StudioKeyboardRelation {
  readonly kind: 'conflict' | 'exclusive' | 'priority'
  readonly priorityActionId: StudioActionId | null
  readonly binding: StudioKeyboardBinding
  readonly actionIds: readonly [StudioActionId, StudioActionId]
}

export function analyzeStudioKeyboardRoutes(
  catalogue: readonly StudioActionDescriptor[],
  keymap: StudioKeyboardKeymap<StudioActionId>,
  registry: StudioKeyboardBindingRegistry,
) {
  const routes = new Map<string, { binding: StudioKeyboardBinding; actionIds: StudioActionId[] }>()
  const relations: StudioKeyboardRelation[] = []
  for (const { actionId } of catalogue) {
    for (const binding of keymap[actionId]) {
      const identity = registry.identity(binding)
      let route = routes.get(identity)
      if (!route) {
        route = { binding, actionIds: [] }
        routes.set(identity, route)
      }
      if (route.actionIds.includes(actionId)) continue
      const context = STUDIO_SHORTCUT_POLICIES[actionId].context
      for (const otherId of route.actionIds) {
        const other = STUDIO_SHORTCUT_POLICIES[otherId].context
        const difference =
          STUDIO_KEYBOARD_CONTEXTS[context].priority - STUDIO_KEYBOARD_CONTEXTS[other].priority
        let kind: StudioKeyboardRelation['kind'] = 'exclusive'
        if (studioKeyboardContextsOverlap(other, context))
          kind = difference === 0 ? 'conflict' : 'priority'
        let priorityActionId: StudioActionId | null = null
        if (kind === 'priority') priorityActionId = difference > 0 ? actionId : otherId
        relations.push(
          Object.freeze({
            kind,
            priorityActionId,
            binding,
            actionIds: Object.freeze([otherId, actionId] as const),
          }),
        )
      }
      route.actionIds.push(actionId)
    }
  }
  for (const route of routes.values()) {
    route.actionIds.sort(
      (a, b) =>
        STUDIO_KEYBOARD_CONTEXTS[STUDIO_SHORTCUT_POLICIES[b].context].priority -
        STUDIO_KEYBOARD_CONTEXTS[STUDIO_SHORTCUT_POLICIES[a].context].priority,
    )
  }
  return {
    routes,
    relations: Object.freeze(relations),
    conflicts: Object.freeze(relations.filter((relation) => relation.kind === 'conflict')),
  }
}
