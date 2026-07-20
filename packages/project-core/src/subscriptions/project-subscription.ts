import type { AffectedTickRange } from '@/commit/project-change'
import type { ProjectCommit } from '@/commit/project-commit'
import { parseMidiSourceId, parseNoteId, type MidiSourceId, type NoteId } from '@/model/ids'
import { ProjectSubscriptionError } from '@/subscriptions/project-subscription-error'
import { parseTick } from '@/time/tick'
import type { ValueOf } from '@seele-daw/type-utils'

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

/** Frozen context for one observer callback that failed after a successful commit. */
export interface ProjectSubscriptionDeliveryFailure {
  readonly subscription: ProjectSubscription
  readonly commit: ProjectCommit
  readonly cause: unknown
}

/** Receives commits asynchronously while keeping delivery failures explicit. */
export interface ProjectSubscriptionObserver {
  onCommit(commit: ProjectCommit): void
  onError(failure: ProjectSubscriptionDeliveryFailure): void
}

export type ProjectUnsubscribe = () => void

function normalizeSourceIds(
  sourceIds: readonly MidiSourceId[] | undefined,
): readonly MidiSourceId[] | undefined {
  if (sourceIds === undefined) return undefined

  if (!Array.isArray(sourceIds)) {
    throw new ProjectSubscriptionError(
      'invalid-source-ids',
      'MIDI Note Subscription sourceIds must be an array',
    )
  }

  if (sourceIds.length === 0) {
    throw new ProjectSubscriptionError(
      'empty-source-ids',
      'MIDI Note Subscription sourceIds cannot be empty',
    )
  }

  return Object.freeze([...new Set(sourceIds.map(parseMidiSourceId))])
}

function normalizeNoteIds(noteIds: readonly NoteId[] | undefined): readonly NoteId[] | undefined {
  if (noteIds === undefined) return undefined

  if (!Array.isArray(noteIds)) {
    throw new ProjectSubscriptionError(
      'invalid-note-ids',
      'MIDI Note Subscription noteIds must be an array',
    )
  }

  if (noteIds.length === 0) {
    throw new ProjectSubscriptionError(
      'empty-note-ids',
      'MIDI Note Subscription noteIds cannot be empty',
    )
  }

  return Object.freeze([...new Set(noteIds.map(parseNoteId))])
}

function normalizeAffectedRange(
  affected: AffectedTickRange | undefined,
): AffectedTickRange | undefined {
  if (affected === undefined) return undefined

  const startTick = parseTick(affected.startTick)
  const endTick = parseTick(affected.endTick)

  if (endTick <= startTick) {
    throw new ProjectSubscriptionError(
      'invalid-tick-range',
      'MIDI Note Subscription requires affected.endTick to be greater than startTick',
      { startTick, endTick },
    )
  }

  return Object.freeze({ startTick, endTick })
}

export function createAllProjectCommitsSubscription(): AllProjectCommitsSubscription {
  return Object.freeze({ type: PROJECT_SUBSCRIPTION_TYPE.ALL_COMMITS })
}

export function createMidiNoteChangesSubscription(
  input: CreateMidiNoteChangesSubscriptionInput = {},
): MidiNoteChangesSubscription {
  const sourceIds = normalizeSourceIds(input.sourceIds)
  const noteIds = normalizeNoteIds(input.noteIds)
  const affected = normalizeAffectedRange(input.affected)

  return Object.freeze({
    type: PROJECT_SUBSCRIPTION_TYPE.MIDI_NOTE_CHANGES,
    ...(sourceIds === undefined ? {} : { sourceIds }),
    ...(noteIds === undefined ? {} : { noteIds }),
    ...(affected === undefined ? {} : { affected }),
  })
}

function rejectUnknownSubscription(subscription: never): never {
  const type = (subscription as { readonly type?: unknown }).type

  throw new ProjectSubscriptionError(
    'unknown-subscription-type',
    `ProjectSubscription has an unknown type: ${String(type)}`,
    { subscriptionType: String(type) },
  )
}

/** @internal Revalidates structurally supplied subscriptions before registration. */
export function normalizeProjectSubscription(
  subscription: ProjectSubscription,
): ProjectSubscription {
  switch (subscription.type) {
    case PROJECT_SUBSCRIPTION_TYPE.ALL_COMMITS:
      return createAllProjectCommitsSubscription()
    case PROJECT_SUBSCRIPTION_TYPE.MIDI_NOTE_CHANGES:
      return createMidiNoteChangesSubscription(subscription)
    default:
      return rejectUnknownSubscription(subscription)
  }
}
