import {
  addTicks,
  createMidiNoteByIdQuery,
  createMidiNoteChangesSubscription,
  type ClipId,
  type MidiSourceId,
  type NoteId,
  reportListenerError,
  type ProjectSession,
  type ProjectUnsubscribe,
} from '@seele-daw/project-core'

import type { PianoRollClipContext } from '#internal/common/piano-roll/piano-roll-clip-context'

export interface PianoRollEditorSessionState {
  readonly clipId: ClipId
  readonly selectedNoteIds: readonly NoteId[]
  readonly sourceId: MidiSourceId
}

export type PianoRollEditorSessionListener = (state: PianoRollEditorSessionState) => void

export interface PianoRollEditorSession {
  readonly state: PianoRollEditorSessionState
  clearSelection(): boolean
  dispose(): void
  selectOnly(noteId: NoteId): boolean
  subscribe(listener: PianoRollEditorSessionListener): () => void
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

class PianoRollEditorSessionImpl implements PianoRollEditorSession {
  readonly #context: PianoRollClipContext
  readonly #listeners = new Set<PianoRollEditorSessionListener>()
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
      () => this.#reconcileSelection(),
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

  subscribe(listener: PianoRollEditorSessionListener): () => void {
    this.#requireActive()
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  dispose(): void {
    if (this.#disposed) return

    this.#disposed = true
    this.#projectUnsubscribe()
    this.#listeners.clear()
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
      note.startTick < this.#context.sourceEndTick && this.#context.sourceStartTick < noteEndTick
    )
  }

  #reconcileSelection(): void {
    if (this.#disposed || this.#state.selectedNoteIds.length === 0) return
    const existingNoteIds = this.#state.selectedNoteIds.filter((noteId) =>
      this.#noteIsSelectable(noteId),
    )
    if (existingNoteIds.length === this.#state.selectedNoteIds.length) return
    this.#replaceSelection(existingNoteIds)
  }

  #replaceSelection(selectedNoteIds: readonly NoteId[]): void {
    this.#state = createState(this.#context, selectedNoteIds)
    this.#notifyStateChange()
  }

  #notifyStateChange(): void {
    for (const listener of this.#listeners) {
      try {
        listener(this.#state)
      } catch (cause) {
        reportListenerError(cause)
      }
    }
  }

  #requireActive(): void {
    if (this.#disposed) throw new Error('The Piano Roll Editor Session is disposed')
  }
}

/** Creates one Clip-scoped, framework-neutral Piano Roll interaction lifetime. */
export function createPianoRollEditorSession(
  input: CreatePianoRollEditorSessionInput,
): PianoRollEditorSession {
  return new PianoRollEditorSessionImpl(input)
}
