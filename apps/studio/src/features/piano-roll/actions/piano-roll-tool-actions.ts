import type { PianoRollToolActionTarget } from '@/features/piano-roll/types/piano-roll-tool-action-target'
import { PIANO_ROLL_TOOL } from '@/features/piano-roll/types/piano-roll-preferences'
import { defineStudioAction, defineStudioContext } from '@/workbench/actions/studio-action'
import { EDITOR_SELECTION_CONTEXT } from '@/workbench/actions/studio-editor-actions'

export const PIANO_ROLL_CONTEXT = defineStudioContext<PianoRollToolActionTarget>({
  id: 'piano-roll',
  label: 'Piano roll',
  priority: 2,
  // The note selection lives inside the focused piano roll.
  overlaps: [EDITOR_SELECTION_CONTEXT],
  isActive: (tools) => tools.isFocused(),
})

export const PIANO_ROLL_TOOL_ACTIONS = [
  defineStudioAction({
    id: 'piano-roll.tool.cursor',
    context: PIANO_ROLL_CONTEXT,
    label: 'Cursor tool',
    description: 'Select the piano roll cursor tool.',
    category: 'editor',
    keywords: ['选择工具', '光标'],
    keys: ['1'],
    resolve: (tools) => ({
      checked: tools.getTool() === PIANO_ROLL_TOOL.CURSOR,
      execute: () => tools.activateTool(PIANO_ROLL_TOOL.CURSOR),
    }),
  }),
  defineStudioAction({
    id: 'piano-roll.tool.pencil',
    context: PIANO_ROLL_CONTEXT,
    label: 'Pencil tool',
    description: 'Select the piano roll pencil tool.',
    category: 'editor',
    keywords: ['画笔', '铅笔', '音符'],
    keys: ['8'],
    resolve: (tools) => ({
      checked: tools.getTool() === PIANO_ROLL_TOOL.PENCIL,
      execute: () => tools.activateTool(PIANO_ROLL_TOOL.PENCIL),
    }),
  }),
  defineStudioAction({
    id: 'piano-roll.snap.toggle',
    context: PIANO_ROLL_CONTEXT,
    label: 'Toggle snap',
    description: 'Turn piano roll grid snapping on or off.',
    category: 'editor',
    keywords: ['吸附', '网格', 'Grid'],
    keys: ['J'],
    resolve: (tools) => ({
      checked: tools.isSnapEnabled(),
      execute: () => tools.toggleSnap(),
    }),
  }),
] as const
