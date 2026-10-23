import { defineStudioAction, defineStudioContext } from '@/workbench/actions/studio-action'

export interface StudioInterfaceActionTarget {
  showShortcuts(): void
  focusNotifications(): void
}

/** The application shell, active whenever it is mounted. */
export const INTERFACE_CONTEXT = defineStudioContext<StudioInterfaceActionTarget>({
  id: 'global',
  label: 'Application',
  priority: 0,
  isActive: () => true,
})

export const INTERFACE_ACTIONS = [
  defineStudioAction({
    id: 'shortcuts.show',
    context: INTERFACE_CONTEXT,
    label: 'Keyboard shortcuts',
    description: 'Find keyboard shortcuts and editor controls.',
    category: 'interface',
    keywords: ['快捷键', '按键', '帮助', 'settings'],
    keys: ['Alt+K'],
    resolve: (shell) => ({ execute: () => shell.showShortcuts() }),
  }),
  defineStudioAction({
    id: 'notifications.focus',
    context: INTERFACE_CONTEXT,
    label: 'Focus notifications',
    description: 'Move keyboard focus to the notification area.',
    category: 'interface',
    keywords: ['通知', '焦点', 'toast'],
    keys: ['F8'],
    resolve: (shell) => ({ execute: () => shell.focusNotifications() }),
  }),
] as const
