import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { MidiNotesIntersectingRangeQuery } from '#internal/queries/project-query'
import { addTicks, type Tick } from '#internal/time/tick'

function compareOpaqueIds(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** Stable public order for MIDI Note range results and their internal index. */
export function compareMidiNotesForQuery(left: MidiNoteRecord, right: MidiNoteRecord): number {
  if (left.startTick !== right.startTick) return left.startTick - right.startTick
  if (left.pitch !== right.pitch) return left.pitch - right.pitch
  return compareOpaqueIds(left.id, right.id)
}

export function midiNoteEndTick(note: MidiNoteRecord): Tick {
  return addTicks(note.startTick, note.durationTick)
}

/** Uses half-open Tick overlap and an inclusive discrete MIDI Pitch range. */
export function midiNoteIntersectsQuery(
  note: MidiNoteRecord,
  query: MidiNotesIntersectingRangeQuery,
): boolean {
  return (
    note.startTick < query.endTick &&
    midiNoteEndTick(note) > query.startTick &&
    note.pitch >= query.minimumPitch &&
    note.pitch <= query.maximumPitch
  )
}
