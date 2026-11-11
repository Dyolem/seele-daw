import {
  AUDIBLE_MIDI_PLAN_STATUS,
  PLAYBACK_PHASE,
  type AudibleMidiPlanStatus,
  type InstrumentPreparationFailure,
  type PlaybackEngineState,
  type SoundbankId,
  type UnsupportedNoteOccurrence,
} from '@seele-daw/playback'

import type { ProjectPlaybackFeedback } from '@/workbench/project/playback/project-playback-state'

const MAXIMUM_UNSUPPORTED_NOTE_SUMMARY_ITEMS = 6

const LOADING = Object.freeze<ProjectPlaybackFeedback>({
  kind: 'info',
  message: 'Loading instrument…',
})

function planFeedback(status: AudibleMidiPlanStatus): ProjectPlaybackFeedback | null {
  switch (status) {
    case AUDIBLE_MIDI_PLAN_STATUS.EMPTY:
      return Object.freeze({ kind: 'info', message: 'No audible MIDI notes to play.' })
    case AUDIBLE_MIDI_PLAN_STATUS.PARTIAL:
      return Object.freeze({
        kind: 'warning',
        message: 'Some unsupported project content will be skipped.',
      })
    default:
      return null
  }
}

function failureFeedback(cause: unknown): ProjectPlaybackFeedback {
  const message =
    cause instanceof Error && cause.message.trim() !== ''
      ? cause.message
      : 'The audio runtime could not start playback.'
  return Object.freeze({ kind: 'error', message })
}

/** e.g. "studio-grand MIDI 64 ×2; studio-grand MIDI 67", in soundbank and pitch order. */
function summarizeUnsupportedNotes(occurrences: readonly UnsupportedNoteOccurrence[]): string {
  const countsBySoundbank = new Map<SoundbankId, Map<number, number>>()
  for (const { pitch, soundbankId } of occurrences) {
    let counts = countsBySoundbank.get(soundbankId)
    if (counts === undefined) {
      counts = new Map()
      countsBySoundbank.set(soundbankId, counts)
    }
    counts.set(pitch, (counts.get(pitch) ?? 0) + 1)
  }
  const items = [...countsBySoundbank]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .flatMap(([soundbankId, counts]) =>
      [...counts]
        .sort(([left], [right]) => left - right)
        .map(([pitch, count]) => `${soundbankId} MIDI ${pitch}${count > 1 ? ` ×${count}` : ''}`),
    )
  const visible = items.slice(0, MAXIMUM_UNSUPPORTED_NOTE_SUMMARY_ITEMS)
  const hidden = items.length - visible.length
  return `${visible.join('; ')}${hidden > 0 ? `; plus ${hidden} more` : ''}`
}

function preparationFeedback(
  failures: readonly InstrumentPreparationFailure[],
  unsupported: readonly UnsupportedNoteOccurrence[],
): ProjectPlaybackFeedback | null {
  const messages: string[] = []
  if (failures.length > 0) {
    const soundbankIds = [...new Set(failures.map(({ soundbankId }) => soundbankId))]
    messages.push(
      `Instrument resources could not be loaded for ${soundbankIds.join(', ')}; affected tracks are silent.`,
    )
  }
  if (unsupported.length > 0) {
    const events = unsupported.length === 1 ? 'event was' : 'events were'
    messages.push(
      `${unsupported.length} MIDI note ${events} skipped because the selected instrument control files do not cover those pitches: ${summarizeUnsupportedNotes(unsupported)}.`,
    )
  }
  return messages.length === 0
    ? null
    : Object.freeze({ kind: 'warning', message: messages.join(' ') })
}

/** What the workbench tells the user about playback, if anything. */
export function describePlaybackFeedback(
  state: PlaybackEngineState,
): ProjectPlaybackFeedback | null {
  switch (state.phase) {
    case PLAYBACK_PHASE.UNAVAILABLE:
      return null
    case PLAYBACK_PHASE.FAILED:
      return failureFeedback(state.failureCause)
    case PLAYBACK_PHASE.LOADING:
      return LOADING
    default:
      return (
        preparationFeedback(state.preparationFailures, state.unsupportedNoteOccurrences) ??
        (state.plan === null ? null : planFeedback(state.plan.status))
      )
  }
}
