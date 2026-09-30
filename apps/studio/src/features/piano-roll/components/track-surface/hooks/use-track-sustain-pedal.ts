import { computed, type ShallowRef } from 'vue'
import { createPianoRollTrackSustainPedalLaneReadModel } from '@seele-daw/editor'
import type { PianoRollSustainPedalLanePlacement } from '@/features/piano-roll/types/piano-roll-sustain-pedal'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import { describeCause } from '@/features/piano-roll/presentation/piano-roll-feedback'
import { ProjectMidiSustainPedalError } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-error'
import { useProjectMidiSustainPedal } from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-context'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'

export function useTrackSustainPedal({
  getPresentation,
  failureMessage,
}: {
  readonly getPresentation: () => ReadyProjectPianoRollTrackPresentation
  readonly failureMessage: ShallowRef<string | null>
}) {
  const { projectMidiSustainPedal } = useProjectMidiSustainPedal()
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
  function reportSustainPedalFailure(cause: unknown): void {
    const message = describeCause(
      cause,
      'The Sustain Pedal Lane could not complete the interaction.',
    )
    failureMessage.value = message
    if (
      cause instanceof ProjectMidiSustainPedalError &&
      ['target-clip-looped', 'timeline-tick-outside-clip', 'track-active-clip-required'].includes(
        cause.code,
      )
    ) {
      toasts.warning('Sustain Pedal edit needs attention', message)
      return
    }
    toasts.danger('Sustain Pedal edit could not complete', message)
  }

  function handleSustainPedalCompleted(): void {
    failureMessage.value = null
  }

  function handleSustainPedalPlacement(placement: PianoRollSustainPedalLanePlacement): void {
    try {
      projectMidiSustainPedal.placeOnTrack({
        activeClipId: placement.activeClipId,
        baseRevision: placement.modelRevision,
        channel: placement.channel,
        projectTick: placement.timelineTick,
        trackId: getPresentation().trackId,
        value: placement.value,
      })
      failureMessage.value = null
    } catch (cause) {
      reportSustainPedalFailure(cause)
    }
  }

  return {
    sustainPedalLaneReadModel,
    reportSustainPedalFailure,
    handleSustainPedalCompleted,
    handleSustainPedalPlacement,
  }
}
