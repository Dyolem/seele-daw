import { ARRANGEMENT_ACTIONS } from '@/features/project-workspace/actions/arrangement-keyboard-actions'
import { PROJECT_WORKBENCH_ACTIONS } from '@/features/project-workspace/actions/project-workbench-actions'
import { PIANO_ROLL_TOOL_ACTIONS } from '@/features/piano-roll/actions/piano-roll-tool-actions'
import { EDITOR_ACTIONS } from '@/workbench/actions/studio-editor-actions'
import { INTERFACE_ACTIONS } from '@/workbench/actions/studio-interface-actions'

/** Every Studio action, in catalogue order. Each feature declares its own. */
export const STUDIO_ACTIONS = [
  ...PROJECT_WORKBENCH_ACTIONS,
  ...EDITOR_ACTIONS,
  ...ARRANGEMENT_ACTIONS,
  ...PIANO_ROLL_TOOL_ACTIONS,
  ...INTERFACE_ACTIONS,
] as const

export type StudioActionId = (typeof STUDIO_ACTIONS)[number]['id']
