import {
  PROJECT_CHANGE_TYPE,
  type AffectedTickRange,
  type ProjectChange,
} from '#internal/commit/project-change'
import type { ProjectCommit } from '#internal/commit/project-commit'
import type { MidiSourceId, NoteId } from '#internal/model/ids'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import { ProjectSubscriptionError } from '#internal/subscriptions/project-subscription-error'
import {
  PROJECT_SUBSCRIPTION_TYPE,
  normalizeProjectSubscription,
  type MidiNoteChangesSubscription,
  type ProjectSubscription,
  type ProjectSubscriptionDeliveryFailure,
  type ProjectSubscriptionObserver,
  type ProjectUnsubscribe,
} from '#internal/subscriptions/project-subscription'
import { addTicks } from '#internal/time/tick'

interface SubscriptionEntry {
  active: boolean
  readonly subscription: ProjectSubscription
  readonly observer: ProjectSubscriptionObserver
  readonly onCommit: ProjectSubscriptionObserver['onCommit']
  readonly onError: ProjectSubscriptionObserver['onError']
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

function matchesPlacedMidiNote(
  subscription: MidiNoteChangesSubscription,
  sourceId: MidiSourceId,
  note: MidiNoteRecord,
): boolean {
  return matchesMidiNoteAddress(subscription, sourceId, note.id, {
    startTick: note.startTick,
    endTick: addTicks(note.startTick, note.durationTick),
  })
}

function matchesMidiNoteChange(
  subscription: MidiNoteChangesSubscription,
  change: ProjectChange,
): boolean {
  switch (change.type) {
    case PROJECT_CHANGE_TYPE.INSTRUMENT_DEVICE.UPDATED:
    case PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED:
    case PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.REMOVED:
    case PROJECT_CHANGE_TYPE.MIDI_CLIP.UPDATED:
    case PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADDED:
    case PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVED:
    case PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.UPDATED:
    case PROJECT_CHANGE_TYPE.TEMPO_EVENT.ADDED:
    case PROJECT_CHANGE_TYPE.TEMPO_EVENT.REMOVED:
    case PROJECT_CHANGE_TYPE.TEMPO_EVENT.UPDATED:
      return false

    case PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED:
      return change.after.notes.some((note) =>
        matchesPlacedMidiNote(subscription, change.sourceId, note),
      )

    case PROJECT_CHANGE_TYPE.MIDI_CLIP.REMOVED:
      return change.before.notes.some((note) =>
        matchesPlacedMidiNote(subscription, change.sourceId, note),
      )

    case PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED:
    case PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED:
    case PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED:
      return matchesMidiNoteAddress(subscription, change.sourceId, change.noteId, change.affected)
  }
}

function matchesSubscription(subscription: ProjectSubscription, commit: ProjectCommit): boolean {
  switch (subscription.type) {
    case PROJECT_SUBSCRIPTION_TYPE.ALL_COMMITS:
      return true
    case PROJECT_SUBSCRIPTION_TYPE.MIDI_NOTE_CHANGES:
      return commit.delta.changes.some((change) => matchesMidiNoteChange(subscription, change))
  }
}

function assertObserver(observer: ProjectSubscriptionObserver): void {
  if (
    typeof observer !== 'object' ||
    observer === null ||
    typeof observer.onCommit !== 'function' ||
    typeof observer.onError !== 'function'
  ) {
    throw new ProjectSubscriptionError(
      'invalid-observer',
      'ProjectSubscription observer must provide onCommit and onError functions',
    )
  }
}

/** Publishes successful commits without exposing listeners to the write transaction. */
export class ChangePublisher {
  readonly #subscriptions = new Set<SubscriptionEntry>()

  subscribe(
    subscription: ProjectSubscription,
    observer: ProjectSubscriptionObserver,
  ): ProjectUnsubscribe {
    const normalizedSubscription = normalizeProjectSubscription(subscription)
    assertObserver(observer)

    // Capture method references at registration so later mutation of the caller-owned
    // observer object cannot silently replace this subscription's behavior.
    const entry: SubscriptionEntry = {
      active: true,
      subscription: normalizedSubscription,
      observer,
      onCommit: observer.onCommit,
      onError: observer.onError,
    }
    this.#subscriptions.add(entry)

    const unsubscribe = (): void => this.#deactivate(entry)
    return Object.freeze(unsubscribe)
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
        entry.onCommit.call(entry.observer, commit)
      } catch (cause) {
        this.#deactivate(entry)

        const failure = Object.freeze<ProjectSubscriptionDeliveryFailure>({
          subscription: entry.subscription,
          commit,
          cause,
        })

        try {
          entry.onError.call(entry.observer, failure)
        } catch {
          // The subscription is already terminated. Error reporting must not recurse
          // or prevent independent observers from receiving the committed fact.
        }
      }
    }
  }

  #deactivate(entry: SubscriptionEntry): void {
    if (!entry.active) return

    entry.active = false
    this.#subscriptions.delete(entry)
  }
}
