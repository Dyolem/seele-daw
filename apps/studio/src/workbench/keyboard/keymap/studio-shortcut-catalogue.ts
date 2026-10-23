import { INTERACTION_MODIFIER_RULES } from '@seele-daw/editor'
import type { StudioActionCategory } from '@/workbench/actions/studio-action'
import type { StudioActionId } from '@/workbench/actions/studio-actions'
import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type { StudioKeyboardInput } from '@/workbench/keyboard/contracts/studio-keyboard-input'

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
      .map((action) =>
        Object.freeze({
          ...action,
          modified: modifiedActionIds.includes(action.id),
          categoryLabel: STUDIO_ACTION_CATEGORIES[action.category],
          contextLabel: action.context.label,
          currentBindings: keyboard.displayBindingsFor(action.id),
          defaultBindings: Object.freeze(action.keys.map(keyboard.formatBinding)),
        }),
      )
      .filter((row) => {
        if (assignment === 'modified' && !row.modified) return false
        if (assignment === 'assigned' && row.currentBindings.length === 0) return false
        if (assignment === 'unassigned' && row.currentBindings.length !== 0) return false
        const text = [
          row.id,
          row.label,
          row.description,
          row.categoryLabel,
          row.contextLabel,
          ...row.keywords,
          ...row.currentBindings,
          ...row.defaultBindings,
          ...keyboard.bindingsFor(row.id),
          ...row.keys,
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
  ...Object.values(INTERACTION_MODIFIER_RULES).map(({ label, keys, description }) => ({
    label,
    keys,
    description,
  })),
])
