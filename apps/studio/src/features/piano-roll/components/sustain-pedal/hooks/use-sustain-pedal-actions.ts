import type { ShallowRef } from 'vue'
import {
  resolvePianoRollDomSustainPedalEventHit,
  resolvePianoRollSustainPedalRemoval,
  type PianoRollSustainPedalEditingScope,
} from '@seele-daw/editor'
import type { MidiSustainPedalEventId } from '@seele-daw/project-core'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  type StudioActionCompletion,
} from '@/workbench/actions/studio-action'
import type { ProjectMidiSustainPedalCoordinator } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-coordinator'
import type { PianoRollSustainPedalLaneHandle } from '@/features/piano-roll/types/piano-roll-sustain-pedal'

export function useSustainPedalActions({
  laneSurface,
  getSelectedEventIds,
  setSelectedEventIds,
  resolveEditingScope,
  hasCancellableInteraction,
  cancelInteraction,
  projectMidiSustainPedal,
  reportFailure,
  reportSuccess,
  requestFocus,
}: {
  readonly laneSurface: Readonly<ShallowRef<HTMLElement | null>>
  readonly getSelectedEventIds: () => readonly MidiSustainPedalEventId[]
  readonly setSelectedEventIds: (ids: readonly MidiSustainPedalEventId[]) => void
  readonly resolveEditingScope: () => PianoRollSustainPedalEditingScope | null
  readonly hasCancellableInteraction: () => boolean
  readonly cancelInteraction: () => StudioActionCompletion
  readonly projectMidiSustainPedal: Pick<ProjectMidiSustainPedalCoordinator, 'removeEvents'>
  readonly reportFailure: (cause: unknown) => void
  readonly reportSuccess: () => void
  readonly requestFocus: () => void
}): PianoRollSustainPedalLaneHandle {
  function hasSelection(): boolean {
    return getSelectedEventIds().length > 0
  }

  function clearSelection(): StudioActionCompletion {
    if (!hasSelection()) return STUDIO_ACTION_NOT_APPLIED
    setSelectedEventIds([])
    reportSuccess()
    return STUDIO_ACTION_COMPLETED
  }

  function removeSelectedEvents(): StudioActionCompletion {
    let removal: ReturnType<typeof resolvePianoRollSustainPedalRemoval>
    try {
      removal = resolvePianoRollSustainPedalRemoval(resolveEditingScope(), getSelectedEventIds())
    } catch (cause) {
      reportFailure(cause)
      return { status: 'failed', cause, reported: true }
    }
    if (removal === null) return STUDIO_ACTION_NOT_APPLIED

    try {
      projectMidiSustainPedal.removeEvents({
        baseRevision: removal.baseRevision,
        clipId: removal.clipId,
        eventIds: removal.eventIds,
      })
      setSelectedEventIds([])
      reportSuccess()
      return STUDIO_ACTION_COMPLETED
    } catch (cause) {
      reportFailure(cause)
      return { status: 'failed', cause, reported: true }
    }
  }

  function isFocused(): boolean {
    const element = laneSurface.value
    return element?.contains(element.ownerDocument.activeElement) ?? false
  }

  function prepareContextMenu(event: MouseEvent): HTMLElement | null {
    const surface = laneSurface.value
    if (surface === null || !event.composedPath().includes(surface) || hasCancellableInteraction())
      return null

    try {
      const scope = resolveEditingScope()
      if (scope === null) return null
      const hit = resolvePianoRollDomSustainPedalEventHit(event, surface)
      if (hit !== null) {
        // Linked Clip occurrences can render the same source event ID more than once.
        const marker = event
          .composedPath()
          .find(
            (node): node is HTMLElement =>
              node instanceof HTMLElement &&
              node.getAttribute('data-piano-roll-sustain-pedal-event-id') ===
                hit.sustainPedalEventId,
          )
        if (marker?.getAttribute('data-piano-roll-clip-id') !== scope.clipId) return null
        if (!scope.events.some(({ event }) => event.id === hit.sustainPedalEventId)) return null
        if (!getSelectedEventIds().includes(hit.sustainPedalEventId)) {
          setSelectedEventIds([hit.sustainPedalEventId])
        }
      }
      surface.focus({ preventScroll: true })
      requestFocus()
      return hasSelection() ? surface : null
    } catch (cause) {
      reportFailure(cause)
      return null
    }
  }

  return {
    cancelInteraction,
    clearSelection,
    hasCancellableInteraction,
    hasSelection,
    isFocused,
    prepareContextMenu,
    removeSelectedEvents,
  }
}
