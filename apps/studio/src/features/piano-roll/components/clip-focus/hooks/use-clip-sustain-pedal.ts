import { PIANO_ROLL_MIDI_CHANNEL_OPTIONS } from '@/features/piano-roll/presentation/piano-roll-channel-options'
import { createPianoRollSustainPedalClipLaneReadModel } from '@seele-daw/editor'
import { parseMidiChannel } from '@seele-daw/project-core'
import { computed, type ShallowRef } from 'vue'
import { describeCause } from '@/features/piano-roll/presentation/piano-roll-feedback'
import { usePianoRollPreferencesStore } from '@/features/piano-roll/state/piano-roll-preferences-store'
import type { ProjectPianoRollSurfaceProps } from '@/features/piano-roll/components/clip-focus/types/clip-focus'
import type { PianoRollSustainPedalLanePlacement } from '@/features/piano-roll/types/piano-roll-sustain-pedal'
import { useProjectMidiSustainPedal } from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-context'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'

/** Adapts Clip-local CC64 presentation and placement to the shared lane. */
export function useClipSustainPedal(
  props: ProjectPianoRollSurfaceProps,
  interactionFailureMessage: ShallowRef<string | null>,
) {
  const { projectMidiSustainPedal } = useProjectMidiSustainPedal()
  const pianoRollPreferences = usePianoRollPreferencesStore()
  const toasts = useUiToastStore()
  const sustainPedalLaneReadModel = computed(() =>
    createPianoRollSustainPedalClipLaneReadModel({
      channel: pianoRollPreferences.sustainPedalChannel,
      context: props.presentation.context,
      snapshot: props.presentation.snapshot,
    }),
  )
  const midiChannelOptions = PIANO_ROLL_MIDI_CHANNEL_OPTIONS

  function handleSustainPedalChannelChange(value: string): void {
    pianoRollPreferences.selectSustainPedalChannel(parseMidiChannel(Number(value)))
  }

  function handleSustainPedalFailure(cause: unknown): void {
    const message = describeCause(
      cause,
      'The Sustain Pedal Lane could not complete the interaction.',
    )
    interactionFailureMessage.value = message
    toasts.danger('Sustain Pedal interaction could not complete', message)
  }

  function handleSustainPedalCompleted(): void {
    interactionFailureMessage.value = null
  }

  function handleSustainPedalPlacement(placement: PianoRollSustainPedalLanePlacement): void {
    if (placement.activeClipId === null) {
      handleSustainPedalFailure(new Error('The Clip Focus Sustain Pedal target is missing.'))
      return
    }
    try {
      projectMidiSustainPedal.placeInClip({
        baseRevision: placement.modelRevision,
        channel: placement.channel,
        clipId: placement.activeClipId,
        clipTick: placement.timelineTick,
        value: placement.value,
      })
      interactionFailureMessage.value = null
    } catch (cause) {
      handleSustainPedalFailure(cause)
    }
  }

  return {
    sustainPedalLaneReadModel,
    midiChannelOptions,
    handleSustainPedalChannelChange,
    handleSustainPedalFailure,
    handleSustainPedalCompleted,
    handleSustainPedalPlacement,
  }
}
