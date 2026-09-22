import type { StudioActionCategory, StudioActionId } from '@/workbench/actions/studio-action'
import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import { STUDIO_SHORTCUT_POLICIES } from '@/workbench/keyboard/studio-default-keymap'
import { STUDIO_KEYBOARD_CONTEXTS } from '@/workbench/keyboard/studio-keyboard-context'
import type { StudioKeyboardInput } from '@/workbench/keyboard/studio-keyboard-input-router'

export const STUDIO_ACTION_CATEGORIES = Object.freeze({
  project: 'Project',
  history: 'History',
  playback: 'Playback',
  editor: 'Editor',
  arrangement: 'Arrangement',
  interface: 'Interface',
} satisfies Record<StudioActionCategory, string>)

/** This projection does not depend on whether a feature is mounted or currently executable. */
export function queryStudioShortcuts(
  actions: StudioActionCoordinator,
  keyboard: StudioKeyboardInput,
  query = '',
  assignment: 'all' | 'assigned' | 'unassigned' | 'modified' = 'all',
  modifiedActionIds: readonly StudioActionId[] = [],
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  return Object.freeze(
    actions.catalogue
      .map((descriptor) => {
        const policy = STUDIO_SHORTCUT_POLICIES[descriptor.actionId]
        return Object.freeze({
          ...descriptor,
          modified: modifiedActionIds.includes(descriptor.actionId),
          categoryLabel: STUDIO_ACTION_CATEGORIES[descriptor.category],
          contextLabel: STUDIO_KEYBOARD_CONTEXTS[policy.context].label,
          currentBindings: keyboard.displayBindingsFor(descriptor.actionId),
          defaultBindings: Object.freeze(policy.defaultBindings.map(keyboard.formatBinding)),
          allowRepeat: policy.allowRepeat,
        })
      })
      .filter((row) => {
        if (assignment === 'modified' && !row.modified) return false
        if (assignment === 'assigned' && row.currentBindings.length === 0) return false
        if (assignment === 'unassigned' && row.currentBindings.length !== 0) return false
        const text = [
          row.actionId,
          row.label,
          row.description,
          row.categoryLabel,
          row.contextLabel,
          ...row.keywords,
          ...row.currentBindings,
          ...row.defaultBindings,
          ...keyboard.bindingsFor(row.actionId),
          ...STUDIO_SHORTCUT_POLICIES[row.actionId].defaultBindings,
        ]
          .join(' ')
          .toLocaleLowerCase()
        return terms.every((term) => text.includes(term))
      }),
  )
}

/** Widget protocols and pointer modifiers are help content, never rebindable Action registrations. */
export const STUDIO_KEYBOARD_CONTROL_HELP = Object.freeze([
  {
    label: 'Buttons and fields',
    keys: 'Tab / Shift+Tab · Enter · Space',
    description:
      'Tab moves focus. Enter and Space activate buttons. Text fields keep their editing keys and IME input.',
  },
  {
    label: 'Menus and dialogs',
    keys: 'Arrow keys · Enter · Escape',
    description:
      'Navigate or choose items, or close the current layer. Open menus and dialogs block background shortcuts.',
  },
  {
    label: 'Timeline ruler',
    keys: '← / → · Home / End · Page Up / Down',
    description:
      'On the focused ruler, locate by beat, boundary, or bar. These are slider controls.',
  },
  {
    label: 'Editor splitter',
    keys: 'Arrow keys · Home / End',
    description:
      'On the focused splitter, resize the editor dock or set its minimum or maximum height.',
  },
  {
    label: 'Editor fields',
    keys: 'Enter · Escape',
    description: 'Commit or cancel a field draft. Cancelling a draft keeps the editor selection.',
  },
  {
    label: 'Pointer selection',
    keys: 'Shift · Ctrl / Cmd',
    description:
      'Modify Note or CC64 selection while clicking. These modifiers belong to the pointer gesture.',
  },
  {
    label: 'Temporary snap bypass',
    keys: 'Alt / Option',
    description:
      'Hold while moving or resizing Notes, or transforming CC64 time, to bypass grid snapping. Pencil placement uses the Snap setting.',
  },
])
