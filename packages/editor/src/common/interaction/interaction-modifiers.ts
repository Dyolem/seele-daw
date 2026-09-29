import type { EditorInputModifiers } from './editor-pointer-input'

/** Physical keys are interpreted here, before domain Operations receive semantic policies. */
export function resolveInteractionModifiers(
  origin: EditorInputModifiers,
  current: EditorInputModifiers,
) {
  return Object.freeze({
    toggleSelection: origin.control || origin.meta || origin.shift,
    bypassSnap: current.alt,
  })
}
