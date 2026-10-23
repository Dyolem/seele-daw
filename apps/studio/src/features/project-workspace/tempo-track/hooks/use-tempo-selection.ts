import type { TempoEventId, Tick } from '@seele-daw/project-core'
import { computed } from 'vue'

import { useTempoEditing } from '@/features/project-workspace/tempo-track/tempo-editing'
import {
  createProjectTempoEventLocationPresentation,
  orderProjectTempoEvents,
  parseProjectTempoEventPositionInput,
} from '@/features/project-workspace/tempo-track/tempo-track'
import type {
  ProjectTempoEventNavigationDirection,
  ProjectTempoEventPositionDraft,
} from '@/features/project-workspace/tempo-track/types/tempo-track'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'

export interface TempoSelectionLayout {
  readonly barSpanTick: Tick
  readonly timeSignatureNumerator: number
  readonly timelineEndTick: Tick
}

/** The selected tempo event as TempoTrackControl shows it, and the edits the control offers. */
export function useTempoSelection(layout: TempoSelectionLayout, reveal: (tick: Tick) => void) {
  const tempo = useTempoEditing()
  const toasts = useUiToastStore()
  const { events, presentedEvents, selectedEventId } = tempo

  const event = computed(
    () => presentedEvents.value.find(({ id }) => id === selectedEventId.value) ?? null,
  )
  const isInitial = computed(
    () => events.value.find(({ id }) => id === selectedEventId.value)?.tick === 0,
  )
  const ordered = computed(() => orderProjectTempoEvents(events.value))
  const index = computed(() => ordered.value.findIndex(({ id }) => id === selectedEventId.value))
  // A preview landing on another event's tick leaves the order, and so the time, undecided.
  const previewCollides = computed(() => {
    const preview = tempo.preview.preview.value
    return (
      preview !== null &&
      events.value.some(({ id, tick }) => id !== preview.tempoEventId && tick === preview.tick)
    )
  })
  const location = computed(() =>
    event.value === null
      ? null
      : createProjectTempoEventLocationPresentation({
          barSpanTick: layout.barSpanTick,
          projectTimeUnavailable: previewCollides.value,
          tempoEvent: event.value,
          tempoEvents: presentedEvents.value,
          timeSignatureNumerator: layout.timeSignatureNumerator,
        }),
  )

  return {
    event,
    isInitial,
    location,
    canNavigatePrevious: computed(() => index.value > 0),
    canNavigateNext: computed(() => index.value >= 0 && index.value < ordered.value.length - 1),
    reveal(): void {
      if (event.value !== null) reveal(event.value.tick)
    },
    navigate(direction: ProjectTempoEventNavigationDirection): void {
      if (index.value < 0) return
      const target = ordered.value[direction === 'previous' ? index.value - 1 : index.value + 1]
      if (target === undefined) return
      tempo.select(target.id)
      reveal(target.tick)
    },
    commitPosition(tempoEventId: TempoEventId, position: ProjectTempoEventPositionDraft): void {
      const result = parseProjectTempoEventPositionInput({
        barSpanTick: layout.barSpanTick,
        position,
        timelineEndTick: layout.timelineEndTick,
        timeSignatureNumerator: layout.timeSignatureNumerator,
      })
      if (result.status === 'rejected') {
        toasts.warning('Tempo Event was not moved', result.message)
        return
      }
      const tempoEvent = events.value.find(({ id }) => id === tempoEventId)
      if (tempoEvent !== undefined && tempoEvent.tick !== result.tick) {
        tempo.move(tempoEventId, result.tick)
      }
    },
  }
}
