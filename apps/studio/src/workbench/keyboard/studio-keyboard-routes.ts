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

export interface StudioKeyboardConflict {
  readonly binding: StudioKeyboardBinding
  readonly actionIds: readonly StudioActionId[]
}

export function analyzeStudioKeyboardRoutes(
  catalogue: readonly StudioActionDescriptor[],
  keymap: StudioKeyboardKeymap<StudioActionId>,
  registry: StudioKeyboardBindingRegistry,
) {
  const routes = new Map<string, { binding: StudioKeyboardBinding; actionIds: StudioActionId[] }>()
  const conflicts: StudioKeyboardConflict[] = []
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
        if (
          STUDIO_KEYBOARD_CONTEXTS[other].priority === STUDIO_KEYBOARD_CONTEXTS[context].priority &&
          studioKeyboardContextsOverlap(other, context)
        ) {
          conflicts.push(Object.freeze({ binding, actionIds: Object.freeze([otherId, actionId]) }))
        }
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
  return { routes, conflicts: Object.freeze(conflicts) }
}
