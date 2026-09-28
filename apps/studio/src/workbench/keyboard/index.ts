/** Feature-facing API. Construction and resource ownership are exposed only through setup. */
export type { StudioKeyboardInput } from './contracts/studio-keyboard-input'
export type { StudioKeyboardRelation } from './contracts/studio-keyboard-relation'
export type { StudioShortcutRecorder } from './contracts/studio-shortcut-recorder'
export type {
  StudioUserKeymap,
  StudioUserKeymapResult,
  StudioUserKeymapState,
} from './contracts/studio-user-keymap'
export { STUDIO_SHORTCUT_POLICIES } from './keymap/studio-default-keymap'
export { STUDIO_KEYBOARD_CONTEXTS } from './keymap/studio-keyboard-context'
export {
  queryStudioShortcuts,
  STUDIO_KEYBOARD_CONTROL_HELP,
} from './keymap/studio-shortcut-catalogue'
