import {
  STUDIO_ACTION_NOT_APPLIED,
  defineStudioAction,
  defineStudioContext,
  type StudioActionCompletion,
  type StudioActionState,
  type StudioContextReader,
  type StudioActionIdsOf,
} from '@/workbench/actions/studio-action'

export interface StudioEditorSelectionTarget {
  isFocused(): boolean
  hasSelection(): boolean
  selectionLabel(): string
  deleteSelection(): StudioActionCompletion
  clearSelection?: () => StudioActionCompletion
  deleteDisabledReason?: () => string | null
}

export interface StudioInteractionTarget {
  isActive(): boolean
  cancel(): StudioActionCompletion
}

/** The last focused selection owner: notes, CC64 events or a tempo event. */
export const EDITOR_SELECTION_CONTEXT = defineStudioContext<StudioEditorSelectionTarget>({
  id: 'editor-selection',
  label: 'Focused notes, CC64 or tempo',
  priority: 2,
  isActive: (selection) => selection.isFocused(),
})

/** A live gesture owns Cancel independently of the focused selection. */
export const INTERACTION_CONTEXT = defineStudioContext<StudioInteractionTarget>({
  id: 'interaction',
  label: 'Active gesture',
  priority: 3,
  isActive: (interaction) => interaction.isActive(),
})

function selectionState(
  selection: StudioEditorSelectionTarget,
  contexts: StudioContextReader,
  run: (() => StudioActionCompletion) | undefined,
  disabledReason: () => string | null = () => null,
): StudioActionState {
  let reason: string | null = null
  if (contexts.isActive(INTERACTION_CONTEXT))
    reason = 'Finish or cancel the current interaction first.'
  else if (run === undefined) reason = 'This editor does not support clearing selection.'
  else if (!selection.hasSelection()) reason = 'There is no selection.'
  else reason = disabledReason()
  return {
    detail: selection.selectionLabel(),
    disabledReason: reason,
    execute: () => run?.() ?? STUDIO_ACTION_NOT_APPLIED,
  }
}

export const EDITOR_ACTIONS = [
  defineStudioAction({
    id: 'editor.selection.delete',
    context: EDITOR_SELECTION_CONTEXT,
    label: 'Delete selection',
    description:
      'Delete selected notes, sustain pedal events, or a removable tempo event in one project edit.',
    category: 'editor',
    keywords: ['删除', '选择', 'Note', 'CC64', 'Tempo'],
    keys: ['Backspace', 'Delete'],
    resolve: (selection, contexts) =>
      selectionState(
        selection,
        contexts,
        () => selection.deleteSelection(),
        () => selection.deleteDisabledReason?.() ?? null,
      ),
  }),
  defineStudioAction({
    id: 'editor.selection.clear',
    context: EDITOR_SELECTION_CONTEXT,
    label: 'Clear selection',
    description: 'Clear the selection in the focused editor when it supports clearing.',
    category: 'editor',
    keywords: ['清空', '取消选择', 'Note', 'CC64'],
    keys: ['Escape'],
    resolve: (selection, contexts) => selectionState(selection, contexts, selection.clearSelection),
  }),
  defineStudioAction({
    id: 'interaction.cancel',
    context: INTERACTION_CONTEXT,
    label: 'Cancel interaction',
    description: 'Cancel the active editing gesture or timeline locate without clearing selection.',
    category: 'editor',
    keywords: ['取消', '拖动', '手势', 'Tempo', '定位'],
    keys: ['Escape'],
    resolve: (interaction) => ({
      disabledReason: interaction.isActive() ? null : 'There is no active interaction.',
      execute: () => interaction.cancel(),
    }),
  }),
] as const

declare module '@/workbench/actions/studio-action' {
  interface StudioActionIds extends StudioActionIdsOf<typeof EDITOR_ACTIONS> {}
}
