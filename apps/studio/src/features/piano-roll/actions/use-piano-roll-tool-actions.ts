import { computed, onBeforeUnmount } from 'vue'
import { usePianoRollToolActionTarget } from '@/features/piano-roll/actions/piano-roll-action-context'
import type { PianoRollToolActionTarget } from '@/features/piano-roll/actions/piano-roll-tool-actions'
import { STUDIO_ACTION, type StudioActionId } from '@/workbench/actions/studio-action'
import { presentStudioAction } from '@/workbench/actions/studio-action-control'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'

export function usePianoRollToolActions(target: PianoRollToolActionTarget) {
  const { actions, keyboard } = useStudioActions()
  const targets = usePianoRollToolActionTarget()
  const release = targets.bind(target)
  onBeforeUnmount(release)
  const controls = computed(() => ({
    cursor: presentStudioAction(actions, keyboard, STUDIO_ACTION.PIANO_ROLL_TOOL_CURSOR),
    pencil: presentStudioAction(actions, keyboard, STUDIO_ACTION.PIANO_ROLL_TOOL_PENCIL),
    snap: presentStudioAction(actions, keyboard, STUDIO_ACTION.PIANO_ROLL_SNAP_TOGGLE),
  }))
  function invoke(actionId: StudioActionId): void {
    actions.invoke(actionId, 'toolbar')
  }
  return { controls, invoke }
}
