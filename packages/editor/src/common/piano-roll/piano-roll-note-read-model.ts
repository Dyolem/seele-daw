import {
  addTicks,
  createMidiNoteChangesSubscription,
  createMidiNotesIntersectingRangeQuery,
  parseTick,
  type ClipId,
  type MidiNoteRecord,
  type MidiSourceId,
  type ModelRevision,
  type ProjectSession,
  type ProjectSubscriptionDeliveryFailure,
  type ProjectUnsubscribe,
  type Tick,
} from '@seele-daw/project-core'

import {
  pianoRollClipTickToSourceTick,
  type PianoRollClipContext,
} from '#internal/common/piano-roll/piano-roll-clip-context'
import { PianoRollError } from '#internal/common/piano-roll/piano-roll-error'
import {
  createPianoRollViewport,
  type PianoRollViewport,
} from '#internal/common/piano-roll/piano-roll-viewport'

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

export type PianoRollNoteReadModelFailureOperation =
  | 'observer-delivery'
  | 'project-query'
  | 'project-subscription'

export interface PianoRollNoteReadModelFailure {
  readonly cause: unknown
  readonly operation: PianoRollNoteReadModelFailureOperation
}

export interface PianoRollNoteReadModelObserver {
  onError(failure: PianoRollNoteReadModelFailure): void
  onStateChange(state: PianoRollNoteReadModelState): void
}

export type PianoRollNoteReadModelUnsubscribe = () => void

export interface PianoRollNoteReadModel {
  readonly state: PianoRollNoteReadModelState
  dispose(): void
  setViewport(viewport: PianoRollViewport): void
  subscribe(observer: PianoRollNoteReadModelObserver): PianoRollNoteReadModelUnsubscribe
}

export interface CreatePianoRollNoteReadModelInput {
  readonly context: PianoRollClipContext
  readonly session: Pick<ProjectSession, 'query' | 'subscribe'>
  readonly viewport: PianoRollViewport
}

function normalizeViewport(
  context: PianoRollClipContext,
  viewport: PianoRollViewport,
): PianoRollViewport {
  if (viewport.clipId !== context.clipId) {
    throw new PianoRollError(
      'viewport-clip-mismatch',
      `Piano Roll Viewport belongs to another Clip, not ${context.clipId}`,
    )
  }

  return createPianoRollViewport(context, viewport)
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
  const queryStartTick = pianoRollClipTickToSourceTick(
    context,
    viewport.visibleStartTick,
  )
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
      result.notes.map((note) =>
        createVisibleNote(context, queryStartTick, queryEndTick, note),
      ),
    ),
    sourceId: context.sourceId,
    viewport,
  })
}

function createFailure(
  operation: PianoRollNoteReadModelFailureOperation,
  cause: unknown,
): PianoRollNoteReadModelFailure {
  return Object.freeze({ cause, operation })
}

class PianoRollNoteReadModelImpl implements PianoRollNoteReadModel {
  readonly #context: PianoRollClipContext
  readonly #session: Pick<ProjectSession, 'query' | 'subscribe'>
  readonly #observers = new Set<PianoRollNoteReadModelObserver>()
  #projectUnsubscribe: ProjectUnsubscribe
  #state: PianoRollNoteReadModelState
  #disposed = false

  constructor(input: CreatePianoRollNoteReadModelInput) {
    const viewport = normalizeViewport(input.context, input.viewport)
    this.#context = input.context
    this.#session = input.session
    this.#state = queryState(input.session, input.context, viewport)
    this.#projectUnsubscribe = this.#subscribeToProject(viewport)
  }

  get state(): PianoRollNoteReadModelState {
    return this.#state
  }

  setViewport(viewport: PianoRollViewport): void {
    this.#requireActive()
    if (this.#state.viewport === viewport) return

    const normalizedViewport = normalizeViewport(this.#context, viewport)
    const nextState = queryState(this.#session, this.#context, normalizedViewport)
    const nextProjectUnsubscribe = this.#subscribeToProject(normalizedViewport)
    const previousProjectUnsubscribe = this.#projectUnsubscribe

    this.#state = nextState
    this.#projectUnsubscribe = nextProjectUnsubscribe
    previousProjectUnsubscribe()
    this.#notifyStateChange()
  }

  subscribe(
    observer: PianoRollNoteReadModelObserver,
  ): PianoRollNoteReadModelUnsubscribe {
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

  #subscribeToProject(viewport: PianoRollViewport): ProjectUnsubscribe {
    const startTick = pianoRollClipTickToSourceTick(
      this.#context,
      viewport.visibleStartTick,
    )
    const endTick = pianoRollClipTickToSourceTick(
      this.#context,
      viewport.visibleEndTick,
    )

    return this.#session.subscribe(
      createMidiNoteChangesSubscription({
        sourceIds: [this.#context.sourceId],
        affected: { startTick, endTick },
      }),
      {
        onCommit: () => this.#refresh(),
        onError: (failure) => this.#notifyProjectSubscriptionFailure(failure),
      },
    )
  }

  #refresh(): void {
    if (this.#disposed) return

    let nextState: PianoRollNoteReadModelState
    try {
      nextState = queryState(this.#session, this.#context, this.#state.viewport)
    } catch (cause) {
      this.#notifyFailure(createFailure('project-query', cause))
      return
    }

    if (nextState.modelRevision === this.#state.modelRevision) return

    this.#state = nextState
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

  #notifyFailure(failure: PianoRollNoteReadModelFailure): void {
    const deliverySnapshot = Array.from(this.#observers)
    for (const observer of deliverySnapshot) {
      if (this.#disposed || !this.#observers.has(observer)) continue
      this.#deliverFailure(observer, failure)
    }
  }

  #deliverFailure(
    observer: PianoRollNoteReadModelObserver,
    failure: PianoRollNoteReadModelFailure,
  ): void {
    try {
      observer.onError(failure)
    } catch {
      // Observer error reporting is isolated from Project and sibling observers.
    }
  }

  #requireActive(): void {
    if (this.#disposed) {
      throw new PianoRollError(
        'read-model-disposed',
        'Piano Roll Note Read Model has been disposed',
      )
    }
  }
}

/** Creates one query-backed, framework-neutral visible Note model. */
export function createPianoRollNoteReadModel(
  input: CreatePianoRollNoteReadModelInput,
): PianoRollNoteReadModel {
  return new PianoRollNoteReadModelImpl(input)
}
