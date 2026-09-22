import {
  defineStudioKeyboardBinding,
  type StudioKeyboardBinding,
  type StudioKeyboardKeymap,
} from '@/workbench/keyboard/studio-keyboard-binding'
import { STUDIO_ACTION, type StudioActionId } from '@/workbench/actions/studio-action'
import type { StudioKeyboardContext } from '@/workbench/keyboard/studio-keyboard-context'

export interface StudioShortcutPolicy {
  readonly context: StudioKeyboardContext
  readonly defaultBindings: readonly StudioKeyboardBinding[]
  readonly allowRepeat: boolean
}

function policy(
  context: StudioKeyboardContext,
  allowRepeat: boolean,
  ...defaultBindings: StudioKeyboardBinding[]
): StudioShortcutPolicy {
  return Object.freeze({ context, allowRepeat, defaultBindings: Object.freeze(defaultBindings) })
}

const key = defineStudioKeyboardBinding

/** The single product-owned declaration of binding, input context and repeat behavior. */
export const STUDIO_SHORTCUT_POLICIES = Object.freeze({
  [STUDIO_ACTION.PROJECT_SAVE]: policy('workbench', false, key('Mod+S')),
  [STUDIO_ACTION.HISTORY_UNDO]: policy('workbench', true, key('Mod+Z')),
  [STUDIO_ACTION.HISTORY_REDO]: policy('workbench', true, key('Mod+Shift+Z'), key('Control+Y')),
  [STUDIO_ACTION.PLAYBACK_TOGGLE]: policy('workbench', false, key('Space')),
  [STUDIO_ACTION.PLAYBACK_RETURN_TO_START]: policy('workbench', false),
  [STUDIO_ACTION.PROJECTS_SHOW]: policy('workbench', false),
  [STUDIO_ACTION.PROJECT_IMPORT_MIDI]: policy('workbench', false),
  [STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS]: policy('workbench', false),
  [STUDIO_ACTION.MIDI_EDITOR_OPEN]: policy('workbench', false),
  [STUDIO_ACTION.EDITOR_SELECTION_DELETE]: policy(
    'editor-selection',
    false,
    key('Backspace'),
    key('Delete'),
  ),
  [STUDIO_ACTION.EDITOR_SELECTION_CLEAR]: policy('editor-selection', false, key('Escape')),
  [STUDIO_ACTION.INTERACTION_CANCEL]: policy('interaction', false, key('Escape')),
  [STUDIO_ACTION.ARRANGEMENT_CLIP_OPEN]: policy('arrangement-clip', false, key('Enter')),
  [STUDIO_ACTION.ARRANGEMENT_CLIP_CREATE]: policy('arrangement-bar', false, key('Enter')),
  [STUDIO_ACTION.PIANO_ROLL_TOOL_CURSOR]: policy('piano-roll', false),
  [STUDIO_ACTION.PIANO_ROLL_TOOL_PENCIL]: policy('piano-roll', false),
  [STUDIO_ACTION.PIANO_ROLL_SNAP_TOGGLE]: policy('piano-roll', false),
  [STUDIO_ACTION.NOTIFICATIONS_FOCUS]: policy('global', false, key('F8')),
  [STUDIO_ACTION.SHORTCUTS_SHOW]: policy('global', false),
} satisfies Readonly<Record<StudioActionId, StudioShortcutPolicy>>)

export type StudioKeyboardKeymapOverrides = Partial<
  Record<StudioActionId, readonly StudioKeyboardBinding[]>
>

/** Defaults remain complete even for Actions without an assigned key. */
export function createStudioKeyboardKeymap(
  overrides: StudioKeyboardKeymapOverrides = {},
): StudioKeyboardKeymap<StudioActionId> {
  // Object.fromEntries loses the keys; the exhaustive Action enumeration proves this complete record.
  return Object.freeze(
    Object.fromEntries(
      Object.values(STUDIO_ACTION).map((actionId) => [
        actionId,
        Object.freeze([
          ...(overrides[actionId] ?? STUDIO_SHORTCUT_POLICIES[actionId].defaultBindings),
        ]),
      ]),
    ),
  ) as StudioKeyboardKeymap<StudioActionId>
}

export const STUDIO_DEFAULT_KEYMAP = createStudioKeyboardKeymap()
