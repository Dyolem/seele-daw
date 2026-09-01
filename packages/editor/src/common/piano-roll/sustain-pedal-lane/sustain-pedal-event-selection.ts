import type { MidiSustainPedalEventId } from '@seele-daw/project-core'

import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollPointerInput,
} from '#internal/common/piano-roll/piano-roll-input'
import type { PianoRollSustainPedalEditingScope } from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-editing-scope'
import type { PianoRollSustainPedalLaneHit } from '#internal/common/piano-roll/sustain-pedal-lane/sustain-pedal-lane-input'

export interface PianoRollSustainPedalSelectionResolution {
  readonly changed: boolean
  readonly selectedEventIds: readonly MidiSustainPedalEventId[]
}

export interface ResolvePianoRollSustainPedalSelectionInput {
  readonly pointerInput: PianoRollPointerInput<PianoRollSustainPedalLaneHit>
  readonly scope: PianoRollSustainPedalEditingScope | null
  readonly selectedEventIds: readonly MidiSustainPedalEventId[]
}

export interface PianoRollSustainPedalRemoval {
  readonly baseRevision: PianoRollSustainPedalEditingScope['modelRevision']
  readonly clipId: PianoRollSustainPedalEditingScope['clipId']
  readonly eventIds: readonly MidiSustainPedalEventId[]
  readonly sourceId: PianoRollSustainPedalEditingScope['sourceId']
}

function editableEventIds(
  scope: PianoRollSustainPedalEditingScope,
): ReadonlySet<MidiSustainPedalEventId> {
  return new Set(scope.events.map(({ event }) => event.id))
}

function selectionsEqual(
  left: readonly MidiSustainPedalEventId[],
  right: readonly MidiSustainPedalEventId[],
): boolean {
  return left.length === right.length && left.every((eventId, index) => eventId === right[index])
}

function createSelectionResolution(
  before: readonly MidiSustainPedalEventId[],
  after: readonly MidiSustainPedalEventId[],
): PianoRollSustainPedalSelectionResolution {
  const selectedEventIds = Object.freeze([...after])
  return Object.freeze({
    changed: !selectionsEqual(before, selectedEventIds),
    selectedEventIds,
  })
}

function requestsSelectionToggle(
  pointerInput: PianoRollPointerInput<PianoRollSustainPedalLaneHit>,
): boolean {
  const modifiers = pointerInput.originModifiers
  return modifiers.control || modifiers.meta || modifiers.shift
}

/** Removes stale IDs and duplicates while preserving the current selection order. */
export function reconcilePianoRollSustainPedalSelection(
  scope: PianoRollSustainPedalEditingScope | null,
  selectedEventIds: readonly MidiSustainPedalEventId[],
): readonly MidiSustainPedalEventId[] {
  if (scope === null || selectedEventIds.length === 0) return Object.freeze([])

  const editableIds = editableEventIds(scope)
  const seen = new Set<MidiSustainPedalEventId>()
  return Object.freeze(
    selectedEventIds.filter((eventId) => {
      if (!editableIds.has(eventId) || seen.has(eventId)) return false
      seen.add(eventId)
      return true
    }),
  )
}

/** Resolves one completed Cursor click without storing selection in Project facts. */
export function resolvePianoRollSustainPedalSelection(
  input: ResolvePianoRollSustainPedalSelectionInput,
): PianoRollSustainPedalSelectionResolution | null {
  const pointerInput = input.pointerInput
  if (
    pointerInput.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.END ||
    pointerInput.hasExceededDragThreshold
  ) {
    return null
  }

  const before = reconcilePianoRollSustainPedalSelection(input.scope, input.selectedEventIds)
  if (pointerInput.hit === null) return createSelectionResolution(input.selectedEventIds, [])
  if (input.scope === null) return null

  const eventId = pointerInput.hit.sustainPedalEventId
  if (!editableEventIds(input.scope).has(eventId)) return null
  if (!requestsSelectionToggle(pointerInput)) {
    return createSelectionResolution(input.selectedEventIds, [eventId])
  }

  const selectedIndex = before.indexOf(eventId)
  const after =
    selectedIndex < 0 ? [...before, eventId] : before.filter((candidate) => candidate !== eventId)
  return createSelectionResolution(input.selectedEventIds, after)
}

/** Freezes the currently valid CC64 selection into one future Remove command target. */
export function resolvePianoRollSustainPedalRemoval(
  scope: PianoRollSustainPedalEditingScope | null,
  selectedEventIds: readonly MidiSustainPedalEventId[],
): PianoRollSustainPedalRemoval | null {
  if (scope === null) return null
  const eventIds = reconcilePianoRollSustainPedalSelection(scope, selectedEventIds)
  if (eventIds.length === 0) return null

  return Object.freeze({
    baseRevision: scope.modelRevision,
    clipId: scope.clipId,
    eventIds,
    sourceId: scope.sourceId,
  })
}
