/** Feature-facing API. Construction and resource ownership are exposed only through setup. */
export { defineStudioKeyboardBinding } from './contracts/studio-keyboard-binding'
export type { StudioHotkey, StudioKeyboardBinding } from './contracts/studio-keyboard-binding'
export type { StudioKeyboardInput } from './contracts/studio-keyboard-input'
export type { StudioKeyboardRelation } from './contracts/studio-keyboard-relation'
export type { StudioShortcutRecorder } from './contracts/studio-shortcut-recorder'
export type {
  StudioUserKeymap,
  StudioUserKeymapResult,
  StudioUserKeymapState,
} from './contracts/studio-user-keymap'
export {
  queryStudioShortcuts,
  STUDIO_KEYBOARD_CONTROL_HELP,
} from './runtime/studio-shortcut-catalogue'
