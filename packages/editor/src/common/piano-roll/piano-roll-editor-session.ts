import {
  addTicks,
  createMidiNoteByIdQuery,
  createMidiNoteChangesSubscription,
  type ClipId,
  type MidiSourceId,
  type NoteId,
  type ProjectSession,
  type ProjectSubscriptionDeliveryFailure,
  type ProjectUnsubscribe,
} from '@seele-daw/project-core'

import type { PianoRollClipContext } from '#internal/common/piano-roll/piano-roll-clip-context'
import { PianoRollError } from '#internal/common/piano-roll/piano-roll-error'

export interface PianoRollEditorSessionState {
  readonly clipId: ClipId
  readonly selectedNoteIds: readonly NoteId[]
  readonly sourceId: MidiSourceId
}

export type PianoRollEditorSessionFailureOperation =
  | 'observer-delivery'
  | 'project-query'
  | 'project-subscription'

export interface PianoRollEditorSessionFailure {
  readonly cause: unknown
  readonly operation: PianoRollEditorSessionFailureOperation
}

export interface PianoRollEditorSessionObserver {
  onError(failure: PianoRollEditorSessionFailure): void
  onStateChange(state: PianoRollEditorSessionState): void
}

export type PianoRollEditorSessionUnsubscribe = () => void

export interface PianoRollEditorSession {
  readonly state: PianoRollEditorSessionState
  clearSelection(): boolean
  dispose(): void
  selectOnly(noteId: NoteId): boolean
  subscribe(observer: PianoRollEditorSessionObserver): PianoRollEditorSessionUnsubscribe
  toggleSelection(noteId: NoteId): boolean
}

export interface CreatePianoRollEditorSessionInput {
  readonly context: PianoRollClipContext
  readonly session: Pick<ProjectSession, 'query' | 'subscribe'>
}

function createState(
  context: PianoRollClipContext,
  selectedNoteIds: readonly NoteId[],
): PianoRollEditorSessionState {
  return Object.freeze({
    clipId: context.clipId,
    selectedNoteIds: Object.freeze([...selectedNoteIds]),
    sourceId: context.sourceId,
  })
}

function createFailure(
  operation: PianoRollEditorSessionFailureOperation,
  cause: unknown,
): PianoRollEditorSessionFailure {
  return Object.freeze({ cause, operation })
}

class PianoRollEditorSessionImpl implements PianoRollEditorSession {
  readonly #context: PianoRollClipContext
  readonly #observers = new Set<PianoRollEditorSessionObserver>()
  readonly #projectSession: Pick<ProjectSession, 'query' | 'subscribe'>
  readonly #projectUnsubscribe: ProjectUnsubscribe
  #disposed = false
  #state: PianoRollEditorSessionState

  constructor(input: CreatePianoRollEditorSessionInput) {
    this.#context = input.context
    this.#projectSession = input.session
    this.#state = createState(input.context, [])
    this.#projectUnsubscribe = input.session.subscribe(
      createMidiNoteChangesSubscription({
        sourceIds: [input.context.sourceId],
      }),
      {
        onCommit: () => this.#reconcileSelection(),
        onError: (failure) => this.#notifyProjectSubscriptionFailure(failure),
      },
    )
  }

  get state(): PianoRollEditorSessionState {
    return this.#state
  }

  selectOnly(noteId: NoteId): boolean {
    this.#requireActive()
    if (!this.#noteIsSelectable(noteId)) return false

    const selectedNoteIds = this.#state.selectedNoteIds
    if (selectedNoteIds.length === 1 && selectedNoteIds[0] === noteId) return false

    this.#replaceSelection([noteId])
    return true
  }

  toggleSelection(noteId: NoteId): boolean {
    this.#requireActive()
    const selectedNoteIds = this.#state.selectedNoteIds
    const selectedIndex = selectedNoteIds.indexOf(noteId)

    if (selectedIndex >= 0) {
      this.#replaceSelection(selectedNoteIds.filter((candidate) => candidate !== noteId))
      return true
    }

    if (!this.#noteIsSelectable(noteId)) return false

    this.#replaceSelection([...selectedNoteIds, noteId])
    return true
  }

  clearSelection(): boolean {
    this.#requireActive()
    if (this.#state.selectedNoteIds.length === 0) return false

    this.#replaceSelection([])
    return true
  }

  subscribe(
    observer: PianoRollEditorSessionObserver,
  ): PianoRollEditorSessionUnsubscribe {
    this.#requireActive()
    this.#observers.add(observer)
    let subscribed = true

    return () => {
      if (!subscribed) return
      subscribed = false
      this.#observers.delete(observer)
    }
  }

  dispose(): void {
    if (this.#disposed) return

    this.#disposed = true
    this.#projectUnsubscribe()
    this.#observers.clear()
  }

  #noteIsSelectable(noteId: NoteId): boolean {
    const note = this.#projectSession.query(
      createMidiNoteByIdQuery({
        sourceId: this.#context.sourceId,
        noteId,
      }),
    ).note

    if (note === undefined) return false
    const noteEndTick = addTicks(note.startTick, note.durationTick)
    return (
      note.startTick < this.#context.sourceEndTick &&
      this.#context.sourceStartTick < noteEndTick
    )
  }

  #reconcileSelection(): void {
    if (this.#disposed || this.#state.selectedNoteIds.length === 0) return

    let existingNoteIds: readonly NoteId[]
    try {
      existingNoteIds = this.#state.selectedNoteIds.filter((noteId) =>
        this.#noteIsSelectable(noteId),
      )
    } catch (cause) {
      this.#notifyFailure(createFailure('project-query', cause))
      return
    }

    if (existingNoteIds.length === this.#state.selectedNoteIds.length) return
    this.#replaceSelection(existingNoteIds)
  }

  #replaceSelection(selectedNoteIds: readonly NoteId[]): void {
    this.#state = createState(this.#context, selectedNoteIds)
    this.#notifyStateChange()
  }

  #notifyStateChange(): void {
    const deliverySnapshot = Array.from(this.#observers)
    for (const observer of deliverySnapshot) {
      if (this.#disposed || !this.#observers.has(observer)) continue

      try {
        observer.onStateChange(this.#state)
      } catch (cause) {
        this.#deliverFailure(observer, createFailure('observer-delivery', cause))
      }
    }
  }

  #notifyProjectSubscriptionFailure(
    failure: ProjectSubscriptionDeliveryFailure,
  ): void {
    if (this.#disposed) return
    this.#notifyFailure(createFailure('project-subscription', failure))
  }

  #notifyFailure(failure: PianoRollEditorSessionFailure): void {
    const deliverySnapshot = Array.from(this.#observers)
    for (const observer of deliverySnapshot) {
      if (this.#disposed || !this.#observers.has(observer)) continue
      this.#deliverFailure(observer, failure)
    }
  }

  #deliverFailure(
    observer: PianoRollEditorSessionObserver,
    failure: PianoRollEditorSessionFailure,
  ): void {
    try {
      observer.onError(failure)
    } catch {
      // Error reporting is isolated from the Project and sibling observers.
    }
  }

  #requireActive(): void {
    if (this.#disposed) {
      throw new PianoRollError(
        'editor-session-disposed',
        'Piano Roll Editor Session has been disposed',
      )
    }
  }
}

/** Creates one Clip-scoped, framework-neutral Piano Roll interaction lifetime. */
export function createPianoRollEditorSession(
  input: CreatePianoRollEditorSessionInput,
): PianoRollEditorSession {
  return new PianoRollEditorSessionImpl(input)
}
