import { computed, type ShallowRef } from 'vue'
import { createPianoRollTrackSustainPedalLaneReadModel } from '@seele-daw/editor'
import type { ProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import { describeCause } from '@/features/piano-roll/presentation/piano-roll-feedback'
import { ProjectEditError } from '@/workbench/edits/edit-session'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'

export function useTrackSustainPedal({
  getPresentation,
  failureMessage,
}: {
  readonly getPresentation: () => ProjectPianoRollTrackPresentation
  readonly failureMessage: ShallowRef<string | null>
}) {
  const pianoRollPreferences = usePianoRollPreferencesStore()
  const toasts = useUiToastStore()
  const sustainPedalLaneReadModel = computed(() =>
    createPianoRollTrackSustainPedalLaneReadModel({
      activeClipId: getPresentation().readModel.activeClipId,
      channel: pianoRollPreferences.sustainPedalChannel,
      snapshot: getPresentation().snapshot,
      trackId: getPresentation().trackId,
    }),
  )
  function reportSustainPedalFailure(cause: unknown, committed = false): void {
    const message = describeCause(
      cause,
      'The Sustain Pedal Lane could not complete the interaction.',
    )
    failureMessage.value = message
    if (committed) {
      toasts.warning('Sustain Pedal edit was committed but could not be displayed', message)
      return
    }
    if (
      cause instanceof ProjectEditError &&
      (cause.code === 'unsupported' || cause.code === 'not-placeable')
    ) {
      toasts.warning('Sustain Pedal edit needs attention', message)
      return
    }
    toasts.danger('Sustain Pedal edit could not complete', message)
  }

  function handleSustainPedalCompleted(): void {
    failureMessage.value = null
  }

  return {
    sustainPedalLaneReadModel,
    reportSustainPedalFailure,
    handleSustainPedalCompleted,
  }
}
