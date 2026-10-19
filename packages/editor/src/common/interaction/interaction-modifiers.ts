import type { EditorInputModifiers } from './editor-pointer-input'

/** Read-only product policy; Keyboard Settings uses the same declarations as Operations. */
export const INTERACTION_MODIFIER_RULES = Object.freeze({
  toggleSelection: Object.freeze({
    physicalKeys: Object.freeze(['shift', 'control', 'meta'] as const),
    sample: 'origin',
    label: 'Pointer selection',
    keys: 'Shift · Ctrl / Cmd',
    description:
      'Modify Note or CC64 selection using the keys held at Pointer Down. These modifiers belong to the pointer gesture.',
  }),
  bypassSnap: Object.freeze({
    physicalKeys: Object.freeze(['alt'] as const),
    sample: 'current',
    label: 'Temporary snap bypass',
    keys: 'Alt / Option',
    description:
      'Hold while moving or resizing Notes, or transforming CC64 time, to bypass grid snapping. Pencil placement uses the Snap setting.',
  }),
})

/** Physical keys are interpreted here, before domain Operations receive semantic policies. */
export function resolveInteractionModifiers(
  origin: EditorInputModifiers,
  current: EditorInputModifiers,
) {
  return Object.freeze({
    toggleSelection: INTERACTION_MODIFIER_RULES.toggleSelection.physicalKeys.some(
      (key) => origin[key],
    ),
    bypassSnap: INTERACTION_MODIFIER_RULES.bypassSnap.physicalKeys.some((key) => current[key]),
  })
}
