import {
  compareNoteSpans,
  type AudibleMidiProjectPlan,
  type MidiNoteSpanPlan,
} from '#internal/compiler/audible-midi-plan'

/** Every span of a plan as one list in span order. */
export function planSpans(plan: AudibleMidiProjectPlan): readonly MidiNoteSpanPlan[] {
  return [...plan.clipSpans.values()].flat().sort(compareNoteSpans)
}
