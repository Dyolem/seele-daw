import type { ProjectCommit } from '#internal/commit/project-commit'
import type { MidiSourceId, NoteId } from '#internal/model/ids'
import type { Tick } from '#internal/time/tick'
import type { ValueOf } from '@seele-daw/type-utils'

/** A half-open timeline interval, e.g. the span a subscriber cares about. */
export interface AffectedTickRange {
  readonly startTick: Tick
  readonly endTick: Tick
}

/** Canonical runtime discriminants for commit subscriptions. */
export const PROJECT_SUBSCRIPTION_TYPE = {
  ALL_COMMITS: 'project-commit.all',
  MIDI_NOTE_CHANGES: 'midi-note.changes',
} as const

export type ProjectSubscriptionType = ValueOf<typeof PROJECT_SUBSCRIPTION_TYPE>

export interface AllProjectCommitsSubscription {
  readonly type: typeof PROJECT_SUBSCRIPTION_TYPE.ALL_COMMITS
}

export interface MidiNoteChangesSubscription {
  readonly type: typeof PROJECT_SUBSCRIPTION_TYPE.MIDI_NOTE_CHANGES
  readonly sourceIds?: readonly MidiSourceId[]
  readonly noteIds?: readonly NoteId[]
  readonly affected?: AffectedTickRange
}

export type ProjectSubscription = AllProjectCommitsSubscription | MidiNoteChangesSubscription

export interface CreateMidiNoteChangesSubscriptionInput {
  readonly sourceIds?: readonly MidiSourceId[]
  readonly noteIds?: readonly NoteId[]
  readonly affected?: AffectedTickRange
}

/** Receives each matching commit in a microtask after it was applied. */
export type ProjectCommitListener = (commit: ProjectCommit) => void

export type ProjectUnsubscribe = () => void

function uniqueIds<Id>(ids: readonly Id[] | undefined, field: string): readonly Id[] | undefined {
  if (ids === undefined) return undefined
  // An empty filter would match nothing; leaving the filter out matches everything.
  if (ids.length === 0) throw new RangeError(`MIDI Note Subscription ${field} cannot be empty`)
  return Object.freeze([...new Set(ids)])
}

export function createAllProjectCommitsSubscription(): AllProjectCommitsSubscription {
  return Object.freeze({ type: PROJECT_SUBSCRIPTION_TYPE.ALL_COMMITS })
}

export function createMidiNoteChangesSubscription(
  input: CreateMidiNoteChangesSubscriptionInput = {},
): MidiNoteChangesSubscription {
  const sourceIds = uniqueIds(input.sourceIds, 'sourceIds')
  const noteIds = uniqueIds(input.noteIds, 'noteIds')
  const { affected } = input
  if (affected !== undefined && affected.endTick <= affected.startTick) {
    throw new RangeError('MIDI Note Subscription affected range must not be empty')
  }

  return Object.freeze({
    type: PROJECT_SUBSCRIPTION_TYPE.MIDI_NOTE_CHANGES,
    ...(sourceIds === undefined ? {} : { sourceIds }),
    ...(noteIds === undefined ? {} : { noteIds }),
    ...(affected === undefined
      ? {}
      : { affected: Object.freeze({ startTick: affected.startTick, endTick: affected.endTick }) }),
  })
}
