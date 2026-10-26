import {
  addTicks,
  createMidiNoteChangesSubscription,
  createMidiNotesIntersectingRangeQuery,
  parseTick,
  type ClipId,
  type MidiNoteRecord,
  type MidiSourceId,
  type ModelRevision,
  reportListenerError,
  type ProjectSession,
  type ProjectUnsubscribe,
  type Tick,
} from '@seele-daw/project-core'

import {
  pianoRollClipTickToSourceTick,
  type PianoRollClipContext,
} from '#internal/common/piano-roll/piano-roll-clip-context'
import type { PianoRollViewport } from '#internal/common/piano-roll/piano-roll-viewport'

export interface PianoRollVisibleNote {
  readonly note: MidiNoteRecord
  readonly visibleEndTick: Tick
  readonly visibleStartTick: Tick
}

export interface PianoRollNoteReadModelState {
  readonly clipId: ClipId
  readonly modelRevision: ModelRevision
  readonly notes: readonly PianoRollVisibleNote[]
  readonly sourceId: MidiSourceId
  readonly viewport: PianoRollViewport
}

export type PianoRollNoteReadModelListener = (state: PianoRollNoteReadModelState) => void

export interface PianoRollNoteReadModel {
  readonly state: PianoRollNoteReadModelState
  dispose(): void
  setViewport(viewport: PianoRollViewport): void
  subscribe(listener: PianoRollNoteReadModelListener): () => void
}

export interface CreatePianoRollNoteReadModelInput {
  readonly context: PianoRollClipContext
  readonly session: Pick<ProjectSession, 'query' | 'subscribe'>
  readonly viewport: PianoRollViewport
}

function createVisibleNote(
  context: PianoRollClipContext,
  queryStartTick: Tick,
  queryEndTick: Tick,
  note: MidiNoteRecord,
): PianoRollVisibleNote {
  const noteEndTick = addTicks(note.startTick, note.durationTick)
  const visibleSourceStartTick = Math.max(queryStartTick, note.startTick)
  const visibleSourceEndTick = Math.min(queryEndTick, noteEndTick)

  return Object.freeze({
    note,
    visibleEndTick: parseTick(visibleSourceEndTick - context.sourceStartTick),
    visibleStartTick: parseTick(visibleSourceStartTick - context.sourceStartTick),
  })
}

function queryState(
  session: Pick<ProjectSession, 'query'>,
  context: PianoRollClipContext,
  viewport: PianoRollViewport,
): PianoRollNoteReadModelState {
  const queryStartTick = pianoRollClipTickToSourceTick(context, viewport.visibleStartTick)
  const queryEndTick = pianoRollClipTickToSourceTick(context, viewport.visibleEndTick)
  const result = session.query(
    createMidiNotesIntersectingRangeQuery({
      sourceId: context.sourceId,
      startTick: queryStartTick,
      endTick: queryEndTick,
      minimumPitch: viewport.minimumPitch,
      maximumPitch: viewport.maximumPitch,
    }),
  )

  return Object.freeze({
    clipId: context.clipId,
    modelRevision: result.modelRevision,
    notes: Object.freeze(
      result.notes.map((note) => createVisibleNote(context, queryStartTick, queryEndTick, note)),
    ),
    sourceId: context.sourceId,
    viewport,
  })
}

class PianoRollNoteReadModelImpl implements PianoRollNoteReadModel {
  readonly #context: PianoRollClipContext
  readonly #session: Pick<ProjectSession, 'query' | 'subscribe'>
  readonly #listeners = new Set<PianoRollNoteReadModelListener>()
  #projectUnsubscribe: ProjectUnsubscribe
  #state: PianoRollNoteReadModelState
  #disposed = false

  constructor(input: CreatePianoRollNoteReadModelInput) {
    this.#context = input.context
    this.#session = input.session
    this.#state = queryState(input.session, input.context, input.viewport)
    this.#projectUnsubscribe = this.#subscribeToProject(input.viewport)
  }

  get state(): PianoRollNoteReadModelState {
    return this.#state
  }

  setViewport(viewport: PianoRollViewport): void {
    this.#requireActive()
    if (this.#state.viewport === viewport) return

    const nextState = queryState(this.#session, this.#context, viewport)
    const nextProjectUnsubscribe = this.#subscribeToProject(viewport)
    const previousProjectUnsubscribe = this.#projectUnsubscribe

    this.#state = nextState
    this.#projectUnsubscribe = nextProjectUnsubscribe
    previousProjectUnsubscribe()
    this.#notifyStateChange()
  }

  subscribe(listener: PianoRollNoteReadModelListener): () => void {
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

  #subscribeToProject(viewport: PianoRollViewport): ProjectUnsubscribe {
    const startTick = pianoRollClipTickToSourceTick(this.#context, viewport.visibleStartTick)
    const endTick = pianoRollClipTickToSourceTick(this.#context, viewport.visibleEndTick)

    return this.#session.subscribe(
      createMidiNoteChangesSubscription({
        sourceIds: [this.#context.sourceId],
        affected: { startTick, endTick },
      }),
      () => this.#refresh(),
    )
  }

  #refresh(): void {
    if (this.#disposed) return
    const nextState = queryState(this.#session, this.#context, this.#state.viewport)
    if (nextState.modelRevision === this.#state.modelRevision) return

    this.#state = nextState
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
    if (this.#disposed) throw new Error('The Piano Roll Note Read Model is disposed')
  }
}

/** Creates one query-backed, framework-neutral visible Note model. */
export function createPianoRollNoteReadModel(
  input: CreatePianoRollNoteReadModelInput,
): PianoRollNoteReadModel {
  return new PianoRollNoteReadModelImpl(input)
}
