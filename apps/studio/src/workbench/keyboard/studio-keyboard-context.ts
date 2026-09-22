export type StudioKeyboardContext =
  | 'global'
  | 'workbench'
  | 'editor-selection'
  | 'interaction'
  | 'piano-roll'
  | 'arrangement-clip'
  | 'arrangement-bar'

export const STUDIO_KEYBOARD_CONTEXTS = Object.freeze({
  global: { label: 'Application', priority: 0 },
  workbench: { label: 'Project workbench', priority: 1 },
  'editor-selection': { label: 'Focused notes, CC64 or tempo', priority: 2 },
  interaction: { label: 'Active gesture', priority: 3 },
  'piano-roll': { label: 'Piano roll', priority: 2 },
  'arrangement-clip': { label: 'Focused arrangement clip', priority: 2 },
  'arrangement-bar': { label: 'Focused arrangement bar', priority: 2 },
} satisfies Record<StudioKeyboardContext, { readonly label: string; readonly priority: number }>)

for (const context of Object.values(STUDIO_KEYBOARD_CONTEXTS)) Object.freeze(context)

/** These regions are mutually exclusive by focus, not by transient business availability. */
export function studioKeyboardContextsOverlap(
  a: StudioKeyboardContext,
  b: StudioKeyboardContext,
): boolean {
  if (a === b) return true
  if (STUDIO_KEYBOARD_CONTEXTS[a].priority !== STUDIO_KEYBOARD_CONTEXTS[b].priority) return true
  return (
    (a === 'piano-roll' && b === 'editor-selection') ||
    (b === 'piano-roll' && a === 'editor-selection')
  )
}
