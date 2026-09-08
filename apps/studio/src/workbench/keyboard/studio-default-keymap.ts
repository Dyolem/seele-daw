import { defineStudioKeyboardBinding } from '@/workbench/keyboard/studio-keyboard-binding'
import { STUDIO_ACTION, type StudioActionId } from '@/workbench/actions/studio-action'

import type {
  StudioKeyboardBinding,
  StudioKeyboardKeymap,
} from '@/workbench/keyboard/studio-keyboard-binding'

const DEFAULT_KEYMAP = {
  [STUDIO_ACTION.HISTORY_REDO]: Object.freeze([
    defineStudioKeyboardBinding('Mod+Shift+Z'),
    defineStudioKeyboardBinding('Control+Y'),
  ]),
  [STUDIO_ACTION.HISTORY_UNDO]: Object.freeze([defineStudioKeyboardBinding('Mod+Z')]),
  [STUDIO_ACTION.PIANO_ROLL_SELECTION_DELETE]: Object.freeze([
    defineStudioKeyboardBinding('Backspace'),
    defineStudioKeyboardBinding('Delete'),
  ]),
  [STUDIO_ACTION.PIANO_ROLL_INTERACTION_CANCEL]: Object.freeze([
    defineStudioKeyboardBinding('Escape'),
  ]),
  [STUDIO_ACTION.PIANO_ROLL_SELECTION_CLEAR]: Object.freeze([
    defineStudioKeyboardBinding('Escape'),
  ]),
  [STUDIO_ACTION.PLAYBACK_TOGGLE]: Object.freeze([defineStudioKeyboardBinding('Space')]),
  [STUDIO_ACTION.PLAYBACK_RETURN_TO_START]: Object.freeze([]),
  [STUDIO_ACTION.PROJECTS_SHOW]: Object.freeze([]),
  [STUDIO_ACTION.PROJECT_IMPORT_MIDI]: Object.freeze([]),
  [STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS]: Object.freeze([]),
  [STUDIO_ACTION.MIDI_EDITOR_OPEN]: Object.freeze([]),
  [STUDIO_ACTION.PROJECT_SAVE]: Object.freeze([defineStudioKeyboardBinding('Mod+S')]),
} satisfies StudioKeyboardKeymap<StudioActionId>

export type StudioKeyboardKeymapOverrides = Partial<
  Record<StudioActionId, readonly StudioKeyboardBinding[]>
>

/** Merges validated user overrides into a new immutable Keymap snapshot. */
export function createStudioKeyboardKeymap(
  overrides: StudioKeyboardKeymapOverrides = {},
): StudioKeyboardKeymap<StudioActionId> {
  const keymap: Record<StudioActionId, readonly StudioKeyboardBinding[]> = { ...DEFAULT_KEYMAP }
  for (const actionId of Object.values(STUDIO_ACTION)) {
    keymap[actionId] = Object.freeze([...(overrides[actionId] ?? DEFAULT_KEYMAP[actionId])])
  }
  return Object.freeze(keymap)
}

/** Product-owned defaults consumed by the current Composition Root. */
export const STUDIO_DEFAULT_KEYMAP = createStudioKeyboardKeymap()
