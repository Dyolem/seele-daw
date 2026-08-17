import type { ModelRevision, NoteId, ProjectSession } from '@seele-daw/project-core'
import { assign, createActor, createMachine, type SnapshotFrom } from 'xstate'

import type { PianoRollClipContext } from '#internal/common/piano-roll/piano-roll-clip-context'
import type { PianoRollGrid } from '#internal/common/piano-roll/piano-roll-grid'
import {
  createPianoRollNoteMoveGesture,
  resolvePianoRollNoteMovePreview,
  type PianoRollNoteMoveGesture,
  type PianoRollNoteMovePreview,
} from '#internal/common/piano-roll/operations/piano-roll-note-move-interaction'
import {
  createPianoRollNoteResizeGesture,
  resolvePianoRollNoteResizePreview,
  type PianoRollNoteResizeGesture,
  type PianoRollNoteResizePreview,
} from '#internal/common/piano-roll/operations/piano-roll-note-resize-interaction'
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollPointerInput,
} from '#internal/common/piano-roll/piano-roll-input'
import {
  resolvePianoRollPencilNotePlacement,
  type PianoRollNotePlacement,
} from '#internal/common/piano-roll/operations/piano-roll-pencil-interaction'
import type { PianoRollViewport } from '#internal/common/piano-roll/piano-roll-viewport'

export const PIANO_ROLL_INTERACTION_TOOL = {
  CURSOR: 'cursor',
  PENCIL: 'pencil',
} as const

export type PianoRollInteractionTool =
  (typeof PIANO_ROLL_INTERACTION_TOOL)[keyof typeof PIANO_ROLL_INTERACTION_TOOL]

export const PIANO_ROLL_INTERACTION_STATUS = {
  AWAITING_AUTHORITY: 'awaiting-authority',
  COMMITTING_NOTE_MOVE: 'committing-note-move',
  COMMITTING_NOTE_RESIZE: 'committing-note-resize',
  IDLE: 'idle',
  MOVING_NOTE: 'moving-note',
  PRESSING: 'pressing',
  RESIZING_NOTE: 'resizing-note',
} as const

export type PianoRollInteractionStatus =
  (typeof PIANO_ROLL_INTERACTION_STATUS)[keyof typeof PIANO_ROLL_INTERACTION_STATUS]

export const PIANO_ROLL_INTERACTION_INTENT = {
  ADD_NOTE: 'note.add',
  MOVE_NOTES: 'notes.move',
  RESIZE_NOTE: 'note.resize',
  RESOLVE_SELECTION: 'selection.resolve',
} as const

export interface PianoRollResolveSelectionIntent {
  readonly pointerInput: PianoRollPointerInput
  readonly type: typeof PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION
}

export interface PianoRollAddNoteIntent {
  readonly placement: PianoRollNotePlacement
  readonly type: typeof PIANO_ROLL_INTERACTION_INTENT.ADD_NOTE
}

export interface PianoRollMoveNotesIntent {
  readonly gesture: PianoRollNoteMoveGesture
  readonly preview: PianoRollNoteMovePreview
  readonly type: typeof PIANO_ROLL_INTERACTION_INTENT.MOVE_NOTES
}

export interface PianoRollResizeNoteIntent {
  readonly gesture: PianoRollNoteResizeGesture
  readonly preview: PianoRollNoteResizePreview
  readonly type: typeof PIANO_ROLL_INTERACTION_INTENT.RESIZE_NOTE
}

export type PianoRollInteractionIntent =
  | PianoRollAddNoteIntent
  | PianoRollMoveNotesIntent
  | PianoRollResizeNoteIntent
  | PianoRollResolveSelectionIntent

export interface PianoRollInteractionConfiguration {
  readonly context: PianoRollClipContext
  readonly grid: PianoRollGrid
  readonly selectedNoteIds: readonly NoteId[]
  readonly session: Pick<ProjectSession, 'query'>
  readonly snapEnabled: boolean
  readonly tool: PianoRollInteractionTool
  readonly viewport: PianoRollViewport | null
}

export interface PianoRollInteractionOutcome {
  readonly failure: unknown | null
  readonly intent: PianoRollInteractionIntent | null
}

export interface PianoRollInteractionState {
  readonly activeGesture: 'note-move' | 'note-resize' | null
  readonly movePreview: PianoRollNoteMovePreview | null
  readonly pointerId: number | null
  readonly resizePreview: PianoRollNoteResizePreview | null
  readonly status: PianoRollInteractionStatus
}

export interface PianoRollInteractionSessionObserver {
  onStateChange(state: PianoRollInteractionState): void
}

export interface ResolvePianoRollMoveCommitInput {
  readonly authorityRevision: ModelRevision
  readonly commitRevision: ModelRevision
}

export interface ResolvePianoRollResizeCommitInput {
  readonly authorityRevision: ModelRevision
  readonly commitRevision: ModelRevision
}

export interface PianoRollInteractionSession {
  readonly state: PianoRollInteractionState

  cancel(): boolean
  dispose(): void
  handlePointerInput(
    input: PianoRollPointerInput,
    configuration?: PianoRollInteractionConfiguration,
  ): PianoRollInteractionOutcome
  notifyAuthorityRevision(revision: ModelRevision): void
  resolveMoveCommit(input: ResolvePianoRollMoveCommitInput): void
  resolveResizeCommit(input: ResolvePianoRollResizeCommitInput): void
  skipMoveCommit(): void
  skipResizeCommit(): void
  subscribe(observer: PianoRollInteractionSessionObserver): () => void
}

interface ActiveInteraction {
  readonly configuration: PianoRollInteractionConfiguration
  readonly moveGesture: PianoRollNoteMoveGesture | null
  readonly pointerId: number
  readonly resizeGesture: PianoRollNoteResizeGesture | null
}

interface InteractionMachineContext {
  readonly active: ActiveInteraction | null
  readonly failure: unknown | null
  readonly intent: PianoRollInteractionIntent | null
  readonly movePreview: PianoRollNoteMovePreview | null
  readonly pendingCommitRevision: ModelRevision | null
  readonly resizePreview: PianoRollNoteResizePreview | null
}

type InteractionMachineEvent =
  | {
      readonly configuration: PianoRollInteractionConfiguration
      readonly input: PianoRollPointerInput
      readonly type: 'pointer.begin'
    }
  | {
      readonly input: PianoRollPointerInput
      readonly type: 'pointer.update'
    }
  | {
      readonly input: PianoRollPointerInput
      readonly type: 'pointer.end'
    }
  | {
      readonly input: PianoRollPointerInput
      readonly type: 'pointer.cancel'
    }
  | { readonly type: 'cancel.requested' }
  | {
      readonly authorityRevision: ModelRevision
      readonly commitRevision: ModelRevision
      readonly type: 'move.commit.accepted'
    }
  | { readonly type: 'move.commit.skipped' }
  | {
      readonly authorityRevision: ModelRevision
      readonly commitRevision: ModelRevision
      readonly type: 'resize.commit.accepted'
    }
  | { readonly type: 'resize.commit.skipped' }
  | {
      readonly revision: ModelRevision
      readonly type: 'authority.updated'
    }

interface InteractionResolution {
  readonly failure: unknown | null
  readonly intent: PianoRollInteractionIntent | null
  readonly movePreview: PianoRollNoteMovePreview | null
  readonly resizePreview: PianoRollNoteResizePreview | null
}

const EMPTY_OUTCOME: PianoRollInteractionOutcome = Object.freeze({
  failure: null,
  intent: null,
})

const EMPTY_RESOLUTION: InteractionResolution = Object.freeze({
  failure: null,
  intent: null,
  movePreview: null,
  resizePreview: null,
})

function createEmptyInteractionContext(): InteractionMachineContext {
  return {
    active: null,
    failure: null,
    intent: null,
    movePreview: null,
    pendingCommitRevision: null,
    resizePreview: null,
  }
}

function freezeConfiguration(
  configuration: PianoRollInteractionConfiguration,
): PianoRollInteractionConfiguration {
  return Object.freeze({
    ...configuration,
    selectedNoteIds: Object.freeze([...configuration.selectedNoteIds]),
  })
}

function createActiveInteraction(
  configurationInput: PianoRollInteractionConfiguration,
  input: PianoRollPointerInput,
): { readonly active: ActiveInteraction; readonly failure: unknown | null } {
  const configuration = freezeConfiguration(configurationInput)

  try {
    const resizeGesture = createPianoRollNoteResizeGesture({
      context: configuration.context,
      pointerInput: input,
      selectedNoteIds: configuration.selectedNoteIds,
      session: configuration.session,
    })
    const moveGesture =
      resizeGesture === null && configuration.tool === PIANO_ROLL_INTERACTION_TOOL.CURSOR
        ? createPianoRollNoteMoveGesture({
            context: configuration.context,
            pointerInput: input,
            selectedNoteIds: configuration.selectedNoteIds,
            session: configuration.session,
          })
        : null

    return Object.freeze({
      active: Object.freeze({
        configuration,
        moveGesture,
        pointerId: input.pointerId,
        resizeGesture,
      }),
      failure: null,
    })
  } catch (failure) {
    return Object.freeze({
      active: Object.freeze({
        configuration,
        moveGesture: null,
        pointerId: input.pointerId,
        resizeGesture: null,
      }),
      failure,
    })
  }
}

function beginInteraction(
  configuration: PianoRollInteractionConfiguration,
  input: PianoRollPointerInput,
): InteractionMachineContext {
  const result = createActiveInteraction(configuration, input)
  return {
    ...createEmptyInteractionContext(),
    active: result.active,
    failure: result.failure,
  }
}

function isMatchingPointer(
  context: InteractionMachineContext,
  input: PianoRollPointerInput,
): boolean {
  return context.active?.pointerId === input.pointerId
}

function canActivateNoteMove(
  context: InteractionMachineContext,
  input: PianoRollPointerInput,
): boolean {
  const active = context.active
  return (
    active !== null &&
    active.pointerId === input.pointerId &&
    input.hasExceededDragThreshold &&
    active.moveGesture !== null &&
    active.configuration.viewport !== null
  )
}

function canActivateNoteResize(
  context: InteractionMachineContext,
  input: PianoRollPointerInput,
): boolean {
  const active = context.active
  return (
    active !== null &&
    active.pointerId === input.pointerId &&
    input.hasExceededDragThreshold &&
    active.resizeGesture !== null &&
    active.configuration.viewport !== null
  )
}

function resolveMove(
  context: InteractionMachineContext,
  input: PianoRollPointerInput,
  createIntent: boolean,
): InteractionResolution {
  const active = context.active
  if (active === null || active.moveGesture === null || active.configuration.viewport === null) {
    return EMPTY_RESOLUTION
  }
  const gesture = active.moveGesture
  const viewport = active.configuration.viewport

  try {
    const movePreview = resolvePianoRollNoteMovePreview({
      gesture,
      grid: active.configuration.grid,
      pointerInput: input,
      snapEnabled: active.configuration.snapEnabled,
      viewport,
    })
    if (movePreview === null) return EMPTY_RESOLUTION

    return Object.freeze({
      failure: null,
      intent: createIntent
        ? Object.freeze({
            gesture,
            preview: movePreview,
            type: PIANO_ROLL_INTERACTION_INTENT.MOVE_NOTES,
          })
        : null,
      movePreview,
      resizePreview: null,
    })
  } catch (failure) {
    return Object.freeze({
      failure,
      intent: null,
      movePreview: null,
      resizePreview: null,
    })
  }
}

function resolveResize(
  context: InteractionMachineContext,
  input: PianoRollPointerInput,
  createIntent: boolean,
): InteractionResolution {
  const active = context.active
  if (active === null || active.resizeGesture === null || active.configuration.viewport === null) {
    return EMPTY_RESOLUTION
  }
  const gesture = active.resizeGesture
  const viewport = active.configuration.viewport

  try {
    const resizePreview = resolvePianoRollNoteResizePreview({
      gesture,
      grid: active.configuration.grid,
      pointerInput: input,
      snapEnabled: active.configuration.snapEnabled,
      viewport,
    })
    if (resizePreview === null) return EMPTY_RESOLUTION

    return Object.freeze({
      failure: null,
      intent: createIntent
        ? Object.freeze({
            gesture,
            preview: resizePreview,
            type: PIANO_ROLL_INTERACTION_INTENT.RESIZE_NOTE,
          })
        : null,
      movePreview: null,
      resizePreview,
    })
  } catch (failure) {
    return Object.freeze({
      failure,
      intent: null,
      movePreview: null,
      resizePreview: null,
    })
  }
}

function resolveCompletedPress(
  context: InteractionMachineContext,
  input: PianoRollPointerInput,
): InteractionResolution {
  const active = context.active
  if (active === null || !isMatchingPointer(context, input)) {
    return EMPTY_RESOLUTION
  }

  if (active.configuration.tool === PIANO_ROLL_INTERACTION_TOOL.CURSOR) {
    if (input.hasExceededDragThreshold) return EMPTY_RESOLUTION

    return Object.freeze({
      failure: null,
      intent: Object.freeze({
        pointerInput: input,
        type: PIANO_ROLL_INTERACTION_INTENT.RESOLVE_SELECTION,
      }),
      movePreview: null,
      resizePreview: null,
    })
  }

  if (active.configuration.viewport === null) {
    return Object.freeze({
      failure: new Error('The Piano Roll is not ready to place a MIDI Note.'),
      intent: null,
      movePreview: null,
      resizePreview: null,
    })
  }

  try {
    const placement = resolvePianoRollPencilNotePlacement({
      context: active.configuration.context,
      grid: active.configuration.grid,
      pointerInput: input,
      snapEnabled: active.configuration.snapEnabled,
      viewport: active.configuration.viewport,
    })

    return Object.freeze({
      failure: null,
      intent:
        placement === null
          ? null
          : Object.freeze({
              placement,
              type: PIANO_ROLL_INTERACTION_INTENT.ADD_NOTE,
            }),
      movePreview: null,
      resizePreview: null,
    })
  } catch (failure) {
    return Object.freeze({
      failure,
      intent: null,
      movePreview: null,
      resizePreview: null,
    })
  }
}

function assignResolution(resolution: InteractionResolution) {
  return {
    failure: resolution.failure,
    intent: resolution.intent,
    movePreview: resolution.movePreview,
    resizePreview: resolution.resizePreview,
  }
}

const interactionMachine = createMachine({
  id: 'piano-roll-interaction',
  types: {} as {
    context: InteractionMachineContext
    events: InteractionMachineEvent
  },
  context: createEmptyInteractionContext(),
  initial: 'idle',
  states: {
    idle: {
      on: {
        'pointer.begin': {
          actions: assign(({ event }) => beginInteraction(event.configuration, event.input)),
          target: 'pressing',
        },
      },
    },
    pressing: {
      on: {
        'pointer.update': [
          {
            guard: ({ context, event }) => canActivateNoteResize(context, event.input),
            actions: assign(({ context, event }) =>
              assignResolution(resolveResize(context, event.input, false)),
            ),
            target: 'resizingNote',
          },
          {
            guard: ({ context, event }) => canActivateNoteMove(context, event.input),
            actions: assign(({ context, event }) =>
              assignResolution(resolveMove(context, event.input, false)),
            ),
            target: 'movingNote',
          },
          {
            guard: ({ context, event }) => isMatchingPointer(context, event.input),
            actions: assign({ failure: null, intent: null }),
          },
        ],
        'pointer.end': [
          {
            guard: ({ context, event }) => canActivateNoteResize(context, event.input),
            actions: assign(({ context, event }) =>
              assignResolution(resolveResize(context, event.input, true)),
            ),
            target: 'committingNoteResize',
          },
          {
            guard: ({ context, event }) => canActivateNoteMove(context, event.input),
            actions: assign(({ context, event }) =>
              assignResolution(resolveMove(context, event.input, true)),
            ),
            target: 'committingNoteMove',
          },
          {
            guard: ({ context, event }) => isMatchingPointer(context, event.input),
            actions: assign(({ context, event }) => ({
              active: null,
              pendingCommitRevision: null,
              ...assignResolution(resolveCompletedPress(context, event.input)),
            })),
            target: 'idle',
          },
        ],
        'pointer.cancel': {
          guard: ({ context, event }) => isMatchingPointer(context, event.input),
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
        'cancel.requested': {
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
      },
    },
    movingNote: {
      on: {
        'pointer.update': {
          guard: ({ context, event }) => isMatchingPointer(context, event.input),
          actions: assign(({ context, event }) =>
            assignResolution(resolveMove(context, event.input, false)),
          ),
        },
        'pointer.end': {
          guard: ({ context, event }) => isMatchingPointer(context, event.input),
          actions: assign(({ context, event }) =>
            assignResolution(resolveMove(context, event.input, true)),
          ),
          target: 'committingNoteMove',
        },
        'pointer.cancel': {
          guard: ({ context, event }) => isMatchingPointer(context, event.input),
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
        'cancel.requested': {
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
      },
    },
    resizingNote: {
      on: {
        'pointer.update': {
          guard: ({ context, event }) => isMatchingPointer(context, event.input),
          actions: assign(({ context, event }) =>
            assignResolution(resolveResize(context, event.input, false)),
          ),
        },
        'pointer.end': {
          guard: ({ context, event }) => isMatchingPointer(context, event.input),
          actions: assign(({ context, event }) =>
            assignResolution(resolveResize(context, event.input, true)),
          ),
          target: 'committingNoteResize',
        },
        'pointer.cancel': {
          guard: ({ context, event }) => isMatchingPointer(context, event.input),
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
        'cancel.requested': {
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
      },
    },
    committingNoteMove: {
      on: {
        'move.commit.accepted': [
          {
            guard: ({ event }) => event.authorityRevision >= event.commitRevision,
            actions: assign(createEmptyInteractionContext),
            target: 'idle',
          },
          {
            actions: assign({
              active: null,
              failure: null,
              intent: null,
              pendingCommitRevision: ({ event }) => event.commitRevision,
            }),
            target: 'awaitingAuthority',
          },
        ],
        'move.commit.skipped': {
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
        'cancel.requested': {
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
      },
    },
    committingNoteResize: {
      on: {
        'resize.commit.accepted': [
          {
            guard: ({ event }) => event.authorityRevision >= event.commitRevision,
            actions: assign(createEmptyInteractionContext),
            target: 'idle',
          },
          {
            actions: assign({
              active: null,
              failure: null,
              intent: null,
              pendingCommitRevision: ({ event }) => event.commitRevision,
            }),
            target: 'awaitingAuthority',
          },
        ],
        'resize.commit.skipped': {
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
        'cancel.requested': {
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
      },
    },
    awaitingAuthority: {
      on: {
        'authority.updated': {
          guard: ({ context, event }) =>
            context.pendingCommitRevision !== null &&
            event.revision >= context.pendingCommitRevision,
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
        'cancel.requested': {
          actions: assign(createEmptyInteractionContext),
          target: 'idle',
        },
        'pointer.begin': {
          actions: assign(({ event }) => beginInteraction(event.configuration, event.input)),
          target: 'pressing',
        },
      },
    },
  },
})

type InteractionMachineSnapshot = SnapshotFrom<typeof interactionMachine>

function mapStatus(snapshot: InteractionMachineSnapshot): PianoRollInteractionStatus {
  if (snapshot.matches('pressing')) return PIANO_ROLL_INTERACTION_STATUS.PRESSING
  if (snapshot.matches('movingNote')) {
    return PIANO_ROLL_INTERACTION_STATUS.MOVING_NOTE
  }
  if (snapshot.matches('resizingNote')) {
    return PIANO_ROLL_INTERACTION_STATUS.RESIZING_NOTE
  }
  if (snapshot.matches('committingNoteMove')) {
    return PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_MOVE
  }
  if (snapshot.matches('committingNoteResize')) {
    return PIANO_ROLL_INTERACTION_STATUS.COMMITTING_NOTE_RESIZE
  }
  if (snapshot.matches('awaitingAuthority')) {
    return PIANO_ROLL_INTERACTION_STATUS.AWAITING_AUTHORITY
  }
  return PIANO_ROLL_INTERACTION_STATUS.IDLE
}

function createPublicState(snapshot: InteractionMachineSnapshot): PianoRollInteractionState {
  const moveGesture = snapshot.context.active?.moveGesture ?? null
  const resizeGesture = snapshot.context.active?.resizeGesture ?? null
  let activeGesture: PianoRollInteractionState['activeGesture'] = null
  if (resizeGesture !== null) {
    activeGesture = 'note-resize'
  } else if (moveGesture !== null) {
    activeGesture = 'note-move'
  }

  return Object.freeze({
    activeGesture,
    movePreview: snapshot.context.movePreview,
    pointerId: snapshot.context.active?.pointerId ?? null,
    resizePreview: snapshot.context.resizePreview,
    status: mapStatus(snapshot),
  })
}

function createOutcome(snapshot: InteractionMachineSnapshot): PianoRollInteractionOutcome {
  return Object.freeze({
    failure: snapshot.context.failure,
    intent: snapshot.context.intent,
  })
}

class PianoRollInteractionSessionImpl implements PianoRollInteractionSession {
  readonly #actor = createActor(interactionMachine)
  readonly #observers = new Set<PianoRollInteractionSessionObserver>()
  #disposed = false
  #state: PianoRollInteractionState

  constructor() {
    this.#actor.start()
    this.#state = createPublicState(this.#actor.getSnapshot())
    this.#actor.subscribe((snapshot) => {
      this.#state = createPublicState(snapshot)
      for (const observer of this.#observers) {
        try {
          observer.onStateChange(this.#state)
        } catch {
          // One observer must not interrupt the interaction actor.
        }
      }
    })
  }

  get state(): PianoRollInteractionState {
    return this.#state
  }

  cancel(): boolean {
    if (this.#disposed || this.#state.status === PIANO_ROLL_INTERACTION_STATUS.IDLE) {
      return false
    }
    this.#actor.send({ type: 'cancel.requested' })
    return true
  }

  dispose(): void {
    if (this.#disposed) return
    this.cancel()
    this.#disposed = true
    this.#observers.clear()
    this.#actor.stop()
  }

  handlePointerInput(
    input: PianoRollPointerInput,
    configuration?: PianoRollInteractionConfiguration,
  ): PianoRollInteractionOutcome {
    if (this.#disposed) return EMPTY_OUTCOME
    const previousSnapshot = this.#actor.getSnapshot()

    switch (input.phase) {
      case PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN:
        if (configuration === undefined) {
          return Object.freeze({
            failure: new Error(
              'Piano Roll interaction configuration is required at Pointer Begin.',
            ),
            intent: null,
          })
        }
        this.#actor.send({
          configuration,
          input,
          type: 'pointer.begin',
        })
        break
      case PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE:
        this.#actor.send({ input, type: 'pointer.update' })
        break
      case PIANO_ROLL_POINTER_INPUT_PHASE.END:
        this.#actor.send({ input, type: 'pointer.end' })
        break
      case PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL:
        this.#actor.send({ input, type: 'pointer.cancel' })
        break
    }

    const snapshot = this.#actor.getSnapshot()
    return snapshot === previousSnapshot ? EMPTY_OUTCOME : createOutcome(snapshot)
  }

  notifyAuthorityRevision(revision: ModelRevision): void {
    if (this.#disposed) return
    this.#actor.send({ revision, type: 'authority.updated' })
  }

  resolveMoveCommit(input: ResolvePianoRollMoveCommitInput): void {
    if (this.#disposed) return
    this.#actor.send({
      authorityRevision: input.authorityRevision,
      commitRevision: input.commitRevision,
      type: 'move.commit.accepted',
    })
  }

  resolveResizeCommit(input: ResolvePianoRollResizeCommitInput): void {
    if (this.#disposed) return
    this.#actor.send({
      authorityRevision: input.authorityRevision,
      commitRevision: input.commitRevision,
      type: 'resize.commit.accepted',
    })
  }

  skipMoveCommit(): void {
    if (this.#disposed) return
    this.#actor.send({ type: 'move.commit.skipped' })
  }

  skipResizeCommit(): void {
    if (this.#disposed) return
    this.#actor.send({ type: 'resize.commit.skipped' })
  }

  subscribe(observer: PianoRollInteractionSessionObserver): () => void {
    if (this.#disposed) return () => undefined
    this.#observers.add(observer)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.#observers.delete(observer)
    }
  }
}

/** Creates one framework-neutral interaction actor for a Piano Roll Surface. */
export function createPianoRollInteractionSession(): PianoRollInteractionSession {
  return new PianoRollInteractionSessionImpl()
}
