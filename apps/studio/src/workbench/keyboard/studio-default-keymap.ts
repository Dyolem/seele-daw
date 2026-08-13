import { defineStudioKeyboardBinding } from '@/workbench/keyboard/studio-keyboard-binding'
import {
  STUDIO_KEYBOARD_ACTION,
  type StudioKeyboardActionId,
} from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'

import type {
  StudioKeyboardBinding,
  StudioKeyboardKeymap,
} from '@/workbench/keyboard/studio-keyboard-binding'

const DEFAULT_KEYMAP = {
  [STUDIO_KEYBOARD_ACTION.HISTORY_REDO]: Object.freeze([
    defineStudioKeyboardBinding('Mod+Shift+Z'),
    defineStudioKeyboardBinding('Control+Y'),
  ]),
  [STUDIO_KEYBOARD_ACTION.HISTORY_UNDO]: Object.freeze([
    defineStudioKeyboardBinding('Mod+Z'),
  ]),
  [STUDIO_KEYBOARD_ACTION.PIANO_ROLL_NOTES_REMOVE]: Object.freeze([
    defineStudioKeyboardBinding('Backspace'),
    defineStudioKeyboardBinding('Delete'),
  ]),
  [STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR]: Object.freeze([
    defineStudioKeyboardBinding('Escape'),
  ]),
  [STUDIO_KEYBOARD_ACTION.PLAYBACK_TOGGLE]: Object.freeze([
    defineStudioKeyboardBinding('Space'),
  ]),
  [STUDIO_KEYBOARD_ACTION.PROJECT_SAVE]: Object.freeze([
    defineStudioKeyboardBinding('Mod+S'),
  ]),
} satisfies StudioKeyboardKeymap<StudioKeyboardActionId>

export type StudioKeyboardKeymapOverrides = Partial<
  Record<StudioKeyboardActionId, readonly StudioKeyboardBinding[]>
>

/** Merges validated user overrides into a new immutable Keymap snapshot. */
export function createStudioKeyboardKeymap(
  overrides: StudioKeyboardKeymapOverrides = {},
): StudioKeyboardKeymap<StudioKeyboardActionId> {
  return Object.freeze({
    [STUDIO_KEYBOARD_ACTION.HISTORY_REDO]: Object.freeze([
      ...(overrides[STUDIO_KEYBOARD_ACTION.HISTORY_REDO] ??
        DEFAULT_KEYMAP[STUDIO_KEYBOARD_ACTION.HISTORY_REDO]),
    ]),
    [STUDIO_KEYBOARD_ACTION.HISTORY_UNDO]: Object.freeze([
      ...(overrides[STUDIO_KEYBOARD_ACTION.HISTORY_UNDO] ??
        DEFAULT_KEYMAP[STUDIO_KEYBOARD_ACTION.HISTORY_UNDO]),
    ]),
    [STUDIO_KEYBOARD_ACTION.PIANO_ROLL_NOTES_REMOVE]: Object.freeze([
      ...(overrides[STUDIO_KEYBOARD_ACTION.PIANO_ROLL_NOTES_REMOVE] ??
        DEFAULT_KEYMAP[STUDIO_KEYBOARD_ACTION.PIANO_ROLL_NOTES_REMOVE]),
    ]),
    [STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR]: Object.freeze([
      ...(overrides[STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR] ??
        DEFAULT_KEYMAP[STUDIO_KEYBOARD_ACTION.PIANO_ROLL_SELECTION_CLEAR]),
    ]),
    [STUDIO_KEYBOARD_ACTION.PLAYBACK_TOGGLE]: Object.freeze([
      ...(overrides[STUDIO_KEYBOARD_ACTION.PLAYBACK_TOGGLE] ??
        DEFAULT_KEYMAP[STUDIO_KEYBOARD_ACTION.PLAYBACK_TOGGLE]),
    ]),
    [STUDIO_KEYBOARD_ACTION.PROJECT_SAVE]: Object.freeze([
      ...(overrides[STUDIO_KEYBOARD_ACTION.PROJECT_SAVE] ??
        DEFAULT_KEYMAP[STUDIO_KEYBOARD_ACTION.PROJECT_SAVE]),
    ]),
  })
}

/** Product-owned defaults consumed by the current Composition Root. */
export const STUDIO_DEFAULT_KEYMAP = createStudioKeyboardKeymap()
