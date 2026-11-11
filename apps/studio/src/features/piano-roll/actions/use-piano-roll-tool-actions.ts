import { computed, onBeforeUnmount } from 'vue'
import type { PianoRollToolControlsPresentation } from '@/features/piano-roll/types/piano-roll-tool-controls'
import { PIANO_ROLL_CONTEXT } from '@/features/piano-roll/actions/piano-roll-tool-actions'
import type { PianoRollToolActionTarget } from '@/features/piano-roll/types/piano-roll-tool-action-target'
import type { StudioActionId } from '@/workbench/actions/studio-action'
import { presentStudioAction } from '@/workbench/actions/studio-action-control'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'

export function usePianoRollToolActions(target: PianoRollToolActionTarget) {
  const { actions, contexts, keyboard } = useStudioActions()
  const release = contexts.bind(PIANO_ROLL_CONTEXT, target)
  onBeforeUnmount(release)
  const controls = computed<PianoRollToolControlsPresentation>(() => ({
    cursor: presentStudioAction(actions, keyboard, 'piano-roll.tool.cursor'),
    pencil: presentStudioAction(actions, keyboard, 'piano-roll.tool.pencil'),
    snap: presentStudioAction(actions, keyboard, 'piano-roll.snap.toggle'),
  }))
  function invoke(actionId: StudioActionId): void {
    actions.invoke(actionId, 'toolbar')
  }
  return { controls, invoke }
}
