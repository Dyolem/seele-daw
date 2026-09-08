import type { StudioActionId, StudioActionPresentation } from '@/workbench/actions/studio-action'
import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type { StudioKeyboardInputRouter } from '@/workbench/keyboard/studio-keyboard-input-router'

export interface StudioActionControl extends StudioActionPresentation {
  readonly actionId: StudioActionId
  readonly shortcut: string
  readonly title: string
}

/** Menus and buttons share business presentation and platform-formatted hints. */
export function presentStudioAction(
  actions: StudioActionCoordinator,
  keyboard: StudioKeyboardInputRouter,
  actionId: StudioActionId,
): StudioActionControl {
  const presentation = actions.presentationFor(actionId)
  const shortcut = keyboard.displayBindingsFor(actionId).join(' / ')
  let title = presentation.label
  if (shortcut) title += ` (${shortcut})`
  if (presentation.disabledReason !== null) title += ` — ${presentation.disabledReason}`
  return Object.freeze({ ...presentation, actionId, shortcut, title })
}
