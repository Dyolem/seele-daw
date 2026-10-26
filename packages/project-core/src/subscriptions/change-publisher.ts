import type { ProjectCommit } from '#internal/commit/project-commit'
import type { MidiSourceId, NoteId } from '#internal/model/ids'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { ProjectChange } from '#internal/mutation/project-change'
import {
  PROJECT_SUBSCRIPTION_TYPE,
  type AffectedTickRange,
  type MidiNoteChangesSubscription,
  type ProjectCommitListener,
  type ProjectSubscription,
  type ProjectUnsubscribe,
} from '#internal/subscriptions/project-subscription'
import { reportListenerError } from '#internal/subscriptions/report-listener-error'
import { addTicks } from '#internal/time/tick'

interface SubscriptionEntry {
  active: boolean
  readonly subscription: ProjectSubscription
  readonly listener: ProjectCommitListener
}

export interface PreparedChangePublication {
  cancel(): void
}

function rangesIntersect(left: AffectedTickRange, right: AffectedTickRange): boolean {
  return left.startTick < right.endTick && right.startTick < left.endTick
}

function matchesMidiNoteAddress(
  subscription: MidiNoteChangesSubscription,
  sourceId: MidiSourceId,
  noteId: NoteId,
  affected: AffectedTickRange,
): boolean {
  return (
    (subscription.sourceIds === undefined || subscription.sourceIds.includes(sourceId)) &&
    (subscription.noteIds === undefined || subscription.noteIds.includes(noteId)) &&
    (subscription.affected === undefined || rangesIntersect(subscription.affected, affected))
  )
}

function noteRange(note: MidiNoteRecord): AffectedTickRange {
  return { startTick: note.startTick, endTick: addTicks(note.startTick, note.durationTick) }
}

function matchesPlacedMidiNote(
  subscription: MidiNoteChangesSubscription,
  sourceId: MidiSourceId,
  note: MidiNoteRecord,
): boolean {
  return matchesMidiNoteAddress(subscription, sourceId, note.id, noteRange(note))
}

function matchesMidiNoteChange(
  subscription: MidiNoteChangesSubscription,
  change: ProjectChange,
): boolean {
  if (change.table !== 'midiNotes') return false

  switch (change.op) {
    case 'insert-partition':
    case 'remove-partition':
      return change.records.some((note) =>
        matchesPlacedMidiNote(subscription, change.sourceId, note),
      )
    case 'insert':
      return matchesPlacedMidiNote(subscription, change.sourceId, change.after)
    case 'remove':
      return matchesPlacedMidiNote(subscription, change.sourceId, change.before)
    case 'replace': {
      // A moved Note matches anywhere between where it was and where it went.
      const before = noteRange(change.before)
      const after = noteRange(change.after)
      return matchesMidiNoteAddress(subscription, change.sourceId, change.after.id, {
        startTick: before.startTick < after.startTick ? before.startTick : after.startTick,
        endTick: before.endTick > after.endTick ? before.endTick : after.endTick,
      })
    }
  }
}

function matchesSubscription(subscription: ProjectSubscription, commit: ProjectCommit): boolean {
  switch (subscription.type) {
    case PROJECT_SUBSCRIPTION_TYPE.ALL_COMMITS:
      return true
    case PROJECT_SUBSCRIPTION_TYPE.MIDI_NOTE_CHANGES:
      return commit.changes.some((change) => matchesMidiNoteChange(subscription, change))
  }
}

/** Publishes successful commits without exposing listeners to the write transaction. */
export class ChangePublisher {
  readonly #subscriptions = new Set<SubscriptionEntry>()

  subscribe(
    subscription: ProjectSubscription,
    listener: ProjectCommitListener,
  ): ProjectUnsubscribe {
    const entry: SubscriptionEntry = { active: true, subscription, listener }
    this.#subscriptions.add(entry)
    return () => {
      entry.active = false
      this.#subscriptions.delete(entry)
    }
  }

  /**
   * Registers a gated microtask before authoritative apply. The caller cancels it on
   * every synchronous failure path; a successful revision write needs only a return.
   */
  prepare(commit: ProjectCommit): PreparedChangePublication {
    const matches = [...this.#subscriptions].filter(
      (entry) => entry.active && matchesSubscription(entry.subscription, commit),
    )
    let cancelled = false

    if (matches.length > 0) {
      void Promise.resolve().then(() => {
        if (!cancelled) this.#deliver(commit, matches)
      })
    }

    return Object.freeze({
      // Cancellation is deliberately idempotent and allocation-free so it is safe in
      // the apply rollback path and cannot replace the authoritative failure.
      cancel(): void {
        cancelled = true
      },
    })
  }

  #deliver(commit: ProjectCommit, entries: readonly SubscriptionEntry[]): void {
    for (const entry of entries) {
      if (!entry.active) continue
      try {
        entry.listener(commit)
      } catch (cause) {
        reportListenerError(cause)
      }
    }
  }
}
