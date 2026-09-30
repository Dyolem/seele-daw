import { computed, shallowRef } from 'vue'
import {
  reconcilePianoRollSustainPedalSelection,
  resolvePianoRollSustainPedalEditingScope,
  type PianoRollClipContext,
  type PianoRollSustainPedalEditingScope,
} from '@seele-daw/editor'
import type { MidiSustainPedalEventId } from '@seele-daw/project-core'
import type { SustainPedalLaneReadModel } from '@/features/piano-roll/components/sustain-pedal/types/sustain-pedal-lane'

export function useSustainPedalSelection({
  getReadModel,
  getClipContext,
  reportFailure,
}: {
  readonly getReadModel: () => SustainPedalLaneReadModel
  readonly getClipContext: () => PianoRollClipContext | null
  readonly reportFailure: (cause: unknown) => void
}) {
  const selectedEventIds = shallowRef<readonly MidiSustainPedalEventId[]>(Object.freeze([]))
  function selectionsEqual(
    left: readonly MidiSustainPedalEventId[],
    right: readonly MidiSustainPedalEventId[],
  ): boolean {
    return left.length === right.length && left.every((eventId, index) => eventId === right[index])
  }

  function setSelectedEventIds(eventIds: readonly MidiSustainPedalEventId[]): void {
    const next = Object.freeze([...eventIds])
    if (selectionsEqual(selectedEventIds.value, next)) return
    selectedEventIds.value = next
  }

  function resolveEditingScope(): PianoRollSustainPedalEditingScope | null {
    const model = getReadModel()
    const context = getClipContext()
    if ('clipId' in model) {
      if (context === null) {
        throw new Error('Clip Focus Sustain Pedal editing requires its Piano Roll Clip context')
      }
      return resolvePianoRollSustainPedalEditingScope({
        context,
        readModel: model,
      })
    }
    return resolvePianoRollSustainPedalEditingScope({ readModel: model })
  }

  function reconcileSelection(): void {
    try {
      setSelectedEventIds(
        reconcilePianoRollSustainPedalSelection(resolveEditingScope(), selectedEventIds.value),
      )
    } catch (cause) {
      setSelectedEventIds([])
      reportFailure(cause)
    }
  }

  return {
    selectedEventIds: computed(() => selectedEventIds.value),
    setSelectedEventIds,
    resolveEditingScope,
    reconcileSelection,
  }
}
